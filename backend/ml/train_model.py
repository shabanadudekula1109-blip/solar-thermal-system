
import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import sys
import os

# Add parent directory to path to import utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.thermal_physics import simulate_system

def generate_dataset(n_samples=2000):
    data = []
    faults = ["Normal Condition", "Dust Accumulation", "Heat Leakage", "Pump Degradation", "Sensor Drift"]
    
    print("Generating synthetic data...")
    
    for _ in range(n_samples):
        # Random inputs within realistic ranges
        irradiance = np.random.uniform(200, 1000) # W/m2
        t_in = np.random.uniform(20, 40) # C
        ambient_temp = np.random.uniform(15, 35) # C
        flow_rate = np.random.uniform(0.02, 0.1) # kg/s
        
        # Pick a fault type randomly
        fault_type = np.random.choice(faults)
        
        # Simulate
        t_out, q_gain, q_loss, eff = simulate_system(irradiance, t_in, flow_rate, ambient_temp, fault_type)
        
        # Add some noise to measurements
        irradiance += np.random.normal(0, 5)
        t_in += np.random.normal(0, 0.2)
        t_out += np.random.normal(0, 0.2)
        flow_rate += np.random.normal(0, 0.001)
        
        # Recalculate derived metrics with noisy data for features
        # We need to make sure the ML model sees 'calculated' features based on noisy sensors
        # Note: In a real system, eff and q_gain are derived features, not raw sensors.
        # But the prompt asks to use them as features.
        
        features = {
            "Solar Irradiance": irradiance,
            "Inlet Temperature": t_in,
            "Outlet Temperature": t_out,
            "Ambient Temperature": ambient_temp, # Added as it's useful, though prompt didn't explicitly mandate it as feature, it's in input.
            "Mass Flow Rate": flow_rate,
            "Thermal Efficiency": eff,
            "Heat Gain": q_gain,
            "Fault Type": fault_type
        }
        data.append(features)
        
    return pd.DataFrame(data)

def train():
    df = generate_dataset(3000)
    
    # Feature columns matching the user prompt + Ambient which is critical for physics context
    # Prompt asked for: Irradiance, Inlet, Outlet, Mass flow, Efficiency, Heat gain. 
    # I will include Ambient because physics depends on Ti - Ta.
    feature_cols = ["Solar Irradiance", "Inlet Temperature", "Outlet Temperature", "Mass Flow Rate", "Thermal Efficiency", "Heat Gain"]
    
    X = df[feature_cols]
    y = df["Fault Type"]
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train
    print("Training Random Forest Classifier...")
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    # Evaluate
    print("Evaluating model...")
    y_pred = clf.predict(X_test)
    print(classification_report(y_test, y_pred))
    
    # Save
    model_path = os.path.join(os.path.dirname(__file__), "fault_detector.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(clf, f)
        
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train()
