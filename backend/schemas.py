
from pydantic import BaseModel, Field
from typing import List, Optional

class SimulationInput(BaseModel):
    solar_irradiance: float = Field(..., description="Solar Irradiance in W/m^2")
    inlet_temperature: float = Field(..., description="Inlet Temperature in Celsius")
    outlet_temperature: Optional[float] = Field(None, description="Outlet Temperature in Celsius (Optional for simulation, required for some analyses)")
    ambient_temperature: float = Field(..., description="Ambient Temperature in Celsius")
    mass_flow_rate: float = Field(..., description="Mass Flow Rate in kg/s")
    fault_condition: str = Field("Normal Condition", description="Condition to simulate (Normal Condition, Dust Accumulation, Heat Leakage, Pump Degradation, Sensor Drift)")

class SimulationOutput(BaseModel):
    useful_heat_gain: float
    heat_loss: float
    thermal_efficiency: float
    simulated_outlet_temperature: float

class PerformanceAnalysisOutput(BaseModel):
    thermal_efficiency: float
    heat_gain: float
    heat_loss: float
    performance_degradation: float
    condition: str
    message: str

class FaultDetectionInput(BaseModel):
    solar_irradiance: float = Field(..., description="Solar Irradiance in W/m^2")
    inlet_temperature: float = Field(..., description="Inlet Temperature in Celsius")
    outlet_temperature: float = Field(..., description="Outlet Temperature in Celsius")
    mass_flow_rate: float = Field(..., description="Mass Flow Rate in kg/s")
    thermal_efficiency: float
    heat_gain: float

class FaultDetectionOutput(BaseModel):
    predicted_fault: str
    confidence_score: float
    suggestion: str

class SimulationHistoryItem(BaseModel):
    timestamp: str
    efficiency: float
    heat_gain: float

class DashboardSummary(BaseModel):
    total_simulations: int
    system_health_index: float
    average_efficiency: float
    recent_faults: List[str]
    history: List[SimulationHistoryItem]
