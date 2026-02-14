from fastapi import FastAPI, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
import pickle
import numpy as np
import os
import sys
import json
from datetime import datetime

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.thermal_physics import simulate_system, calculate_performance, rule_based_diagnosis
from schemas import (
    SimulationInput, SimulationOutput, 
    PerformanceAnalysisOutput, 
    FaultDetectionInput, FaultDetectionOutput,
    DashboardSummary
)

app = FastAPI(
    title="Solar Thermal System Backend",
    description="Backend for Solar Thermal System Performance Evaluation and Fault Diagnosis",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for academic project simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# User-specific data management
BASE_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data/users")

def get_user_dir(user_id: str):
    user_dir = os.path.join(BASE_DATA_DIR, user_id)
    os.makedirs(user_dir, exist_ok=True)
    return user_dir

def load_user_stats(user_id: str):
    stats_file = os.path.join(get_user_dir(user_id), "stats.json")
    if os.path.exists(stats_file):
        try:
            with open(stats_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "total_simulations": 0,
        "total_efficiency_sum": 0.0,
        "recent_faults": [],
        "history": []
    }

def save_user_stats(user_id: str, stats_data: dict):
    stats_file = os.path.join(get_user_dir(user_id), "stats.json")
    with open(stats_file, "w") as f:
        json.dump(stats_data, f, indent=4)

def load_user_history(user_id: str):
    history_file = os.path.join(get_user_dir(user_id), "history.json")
    if os.path.exists(history_file):
        try:
            with open(history_file, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_user_history(user_id: str, history_data: list):
    history_file = os.path.join(get_user_dir(user_id), "history.json")
    with open(history_file, "w") as f:
        json.dump(history_data, f, indent=4)

# Load ML Model
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml/fault_detector.pkl")
clf_model = None

try:
    with open(MODEL_PATH, "rb") as f:
        clf_model = pickle.load(f)
    print("ML Model loaded successfully.")
except FileNotFoundError:
    print(f"Warning: ML Model not found at {MODEL_PATH}. Please run 'python backend/ml/train_model.py' first.")
except Exception as e:
    print(f"Error loading model: {e}")

@app.get("/")
def read_root():
    return {"message": "Solar Thermal API is running. Training the model is required for fault detection."}

@app.post("/simulate", response_model=SimulationOutput)
def run_simulation(data: SimulationInput, x_user_id: str = Header("default", alias="X-User-ID")):
    """
    Simulates the solar thermal system behavior based on physical inputs.
    """
    print(f"DEBUG: Simulation request from User: {x_user_id}")
    stats = load_user_stats(x_user_id)
    try:
        t_out, q_gain, q_loss, eff = simulate_system(
            data.solar_irradiance,
            data.inlet_temperature,
            data.mass_flow_rate,
            data.ambient_temperature,
            data.fault_condition
        )
        
        # Update Dashboard Stats
        stats["total_simulations"] += 1
        stats["total_efficiency_sum"] += eff
        
        from datetime import datetime
        stats["history"].append({
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "efficiency": round(eff, 2),
            "heat_gain": round(q_gain, 2)
        })
        # Keep only last 20 simulations for the graph
        if len(stats["history"]) > 20:
            stats["history"].pop(0)

        # Persistence
        save_user_stats(x_user_id, stats)

        return {
            "useful_heat_gain": round(q_gain, 2),
            "heat_loss": round(q_loss, 2),
            "thermal_efficiency": round(eff, 2),
            "simulated_outlet_temperature": round(t_out, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-performance", response_model=PerformanceAnalysisOutput)
def analyze_performance(data: SimulationInput, x_user_id: str = Header("default", alias="X-User-ID")):
    """
    Evaluates current performance against a theoretical 'Normal' baseline.
    """
    print(f"DEBUG: Performance analysis from User: {x_user_id}")
    if data.outlet_temperature is None:
        raise HTTPException(status_code=400, detail="Outlet temperature required for analysis")
        
    # 1. Calculate current actual metrics based on PROVIDED outlet temp
    actual_q_gain, actual_q_loss, actual_eff = calculate_performance(
        data.solar_irradiance,
        data.inlet_temperature,
        data.outlet_temperature,
        data.mass_flow_rate,
        data.ambient_temperature
    )
    
    # 2. Simulate 'Ideal/Normal' behavior for comparison
    ideal_t_out, ideal_q_gain, ideal_q_loss, ideal_eff = simulate_system(
        data.solar_irradiance,
        data.inlet_temperature,
        data.mass_flow_rate,
        data.ambient_temperature,
        "Normal Condition"
    )
    
    # 3. Calculate degradation
    # degradation = (Ideal - Actual) / Ideal * 100
    if ideal_eff > 0:
        degradation = ((ideal_eff - actual_eff) / ideal_eff) * 100
    else:
        degradation = 0.0
        
    condition = "Optimal"
    message = "System is operating normally."
    
    if degradation > 10:
        condition = "Suboptimal"
        message = "Performance is significantly below theoretical maximum."
    if degradation > 25:
        condition = "Critical"
        message = "Major performance loss detected. Check for faults."
        
    return {
        "thermal_efficiency": round(actual_eff, 2),
        "heat_gain": round(actual_q_gain, 2),
        "heat_loss": round(actual_q_loss, 2),
        "performance_degradation": round(degradation, 2),
        "condition": condition,
        "message": message
    }

@app.post("/detect-fault", response_model=FaultDetectionOutput)
def detect_fault(data: FaultDetectionInput, x_user_id: str = Header("default", alias="X-User-ID")):
    print(f"DEBUG: Fault detection from User: {x_user_id}")
    """
    Uses a hybrid approach: Physical rule-based validation followed by 
    ML classification for refinement.
    """
    # 1. Physical Rule-Based Diagnosis (Primary)
    # Area = 2.0 as defined in thermal_physics.py
    calculated_q_loss = (data.solar_irradiance * 2.0) - data.heat_gain
    
    rule_prediction, rule_conf = rule_based_diagnosis(
        irradiance=data.solar_irradiance,
        t_in=data.inlet_temperature,
        t_out=data.outlet_temperature,
        mass_flow_rate=data.mass_flow_rate,
        efficiency=data.thermal_efficiency,
        q_gain=data.heat_gain,
        q_loss=calculated_q_loss
    )

    # 2. ML Prediction (Secondary/Refinement)
    ml_prediction = None
    ml_conf = 0.0
    
    if clf_model is not None:
        feature_vector = np.array([[
            data.solar_irradiance,
            data.inlet_temperature,
            data.outlet_temperature,
            data.mass_flow_rate,
            data.thermal_efficiency,
            data.heat_gain
        ]])
        try:
            ml_pred = clf_model.predict(feature_vector)[0]
            ml_probs = clf_model.predict_proba(feature_vector)[0]
            ml_prediction = ml_pred
            ml_conf = max(ml_probs) * 100
        except Exception:
            pass

    # 3. Decision Logic: Prioritize Physical Rules
    final_prediction = rule_prediction
    final_confidence = rule_conf

    if ml_prediction:
        if rule_prediction == "Normal Condition" and ml_prediction != "Normal Condition":
            # If rules say normal but ML detects a pattern, weigh ML cautiously
            final_prediction = ml_prediction
            final_confidence = ml_conf * 0.7 
        elif rule_prediction != "Normal Condition" and ml_prediction == rule_prediction:
            # Agreement increases confidence
            final_confidence = min(99.0, rule_conf + (ml_conf * 0.1))
        elif rule_prediction != "Normal Condition" and ml_prediction != rule_prediction:
            # Disagreement: Rules override ML for physical validity
            final_prediction = rule_prediction
            final_confidence = rule_conf

    # Suggestions mapping
    suggestions = {
        "Normal Condition": "System is healthy. No action required.",
        "Dust Accumulation": "Clean the collector glazing surface.",
        "Heat Leakage": "Inspect insulation pipes and connections.",
        "Pump Degradation": "Check pump motor and flow rate settings.",
        "Sensor Drift": "Calibrate temperature sensors.",
        "Low Efficiency": "General system maintenance recommended. Check for multiple scaling issues."
    }

    # Update Stats
    stats = load_user_stats(x_user_id)
    if final_prediction != "Normal Condition":
        stats["recent_faults"].insert(0, final_prediction)
        if len(stats["recent_faults"]) > 5:
            stats["recent_faults"].pop()
    
    save_user_stats(x_user_id, stats)

    # Create Persistence Record
    history_record = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "solar_irradiance": data.solar_irradiance,
        "inlet_temperature": data.inlet_temperature,
        "outlet_temperature": data.outlet_temperature,
        "mass_flow_rate": data.mass_flow_rate,
        "thermal_efficiency": round(data.thermal_efficiency, 2),
        "heat_gain": round(data.heat_gain, 2),
        "predicted_fault": final_prediction,
        "confidence_score": round(final_confidence, 2)
    }
    
    history = load_user_history(x_user_id)
    history.insert(0, history_record)
    save_user_history(x_user_id, history[:100])

    return {
        "predicted_fault": final_prediction,
        "confidence_score": round(final_confidence, 2),
        "suggestion": suggestions.get(final_prediction, "Consult manual.")
    }

@app.get("/dashboard-summary", response_model=DashboardSummary)
def get_dashboard_summary(x_user_id: str = Header("default", alias="X-User-ID")):
    print(f"DEBUG: Dashboard summary for User: {x_user_id}")
    """
    Returns aggregated stats for the dashboard.
    """
    stats = load_user_stats(x_user_id)
    count = stats["total_simulations"]
    avg_eff = 0.0
    if count > 0:
        avg_eff = stats["total_efficiency_sum"] / count
        
    health_index = 100.0
    if stats["recent_faults"]:
        # Simple logic: reduce health for recent faults
        health_index -= len(stats["recent_faults"]) * 5
        if health_index < 0: health_index = 0
    
    return {
        "total_simulations": count,
        "system_health_index": round(health_index, 1),
        "average_efficiency": round(avg_eff, 1),
        "recent_faults": stats["recent_faults"],
        "history": stats["history"]
    }

@app.get("/diagnostic-history")
def get_diagnostic_history(x_user_id: str = Header("default", alias="X-User-ID")):
    print(f"DEBUG: History retrieval for User: {x_user_id}")
    """
    Returns the full persistent history of diagnostic tests.
    """
    return load_user_history(x_user_id)

@app.post("/reset-stats")
def reset_stats(x_user_id: str = Header("default", alias="X-User-ID")):
    print(f"DEBUG: Reset stats for User: {x_user_id}")
    """
    Clears current performance metrics (counters) but preserves the 
    historical log records for traceability.
    """
    stats = load_user_stats(x_user_id)
    
    # Preserve the history list for the charts and logs
    preserved_history = stats.get("history", [])
    
    save_user_stats(x_user_id, {
        "total_simulations": 0,
        "total_efficiency_sum": 0.0,
        "recent_faults": [],
        "history": preserved_history  # Keep the chart data points
    })
    
    # We DO NOT clear the history.json here anymore to keep the 'Results' page intact
    return {"message": "Summary metrics reset. Historical logs preserved."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
