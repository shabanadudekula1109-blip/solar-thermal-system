import numpy as np

# Physical Constants
AREA = 2.0  # m^2
CP = 4186   # J/kg*K (Specific heat of water)

# Collector Design Constants
F_PRIME = 0.90    # Collector efficiency factor
TAU_ALPHA = 0.85  # Transmittance-absorptance product
UL_BASE = 5.0     # Base overall loss coefficient (W/m^2K)

def calculate_fr(mass_flow, cp, area, ul, f_prime):
    """
    Calculates the Heat Removal Factor (Fr) based on flow conditions.
    This is the core of physically accurate solar thermal modeling.
    """
    if mass_flow <= 0:
        return 0.0
    m_cp = mass_flow * cp
    denominator = area * ul
    exponent = (f_prime * ul * area) / m_cp
    fr = (m_cp / denominator) * (1 - np.exp(-exponent))
    return float(fr)

def calculate_performance(irradiance, t_in, t_out, flow_rate, ambient_temp):
    """
    Calculates performance metrics based on measured values.
    Ensures physically valid outputs by capping efficiency and handling negative gain.
    """
    # Ensure flow_rate is valid to avoid division by zero
    if flow_rate <= 0:
        return 0.0, 0.0, 0.0

    # Useful Heat Gain: Q_u = m * Cp * (Tout - Tin)
    q_gain = flow_rate * CP * (t_out - t_in)
    if q_gain < 0:
        q_gain = 0.0
    
    # Input Solar Energy: Q_in = G * A
    input_energy = irradiance * AREA
    
    if input_energy <= 0:
        efficiency = 0.0
    else:
        efficiency = (q_gain / input_energy) * 100  # Percentage
    
    # Efficiency Capping (0-100%)
    if efficiency > 100.0:
        efficiency = 100.0
    elif efficiency < 0.0:
        efficiency = 0.0
        
    # Energy Balance: Losses = Input - Useful
    q_loss = input_energy - q_gain
    if q_loss < 0:
        q_loss = 0.0
    
    return float(q_gain), float(q_loss), float(efficiency)

def simulate_system(irradiance, t_in, flow_rate, ambient_temp, fault_type="Normal Condition"):
    """
    Simulates system behavior using the Hottel-Whillier-Bliss equation.
    Uses high-severity fault multipliers to ensure distinct diagnostic outputs.
    """
    # Base Physical Parameters
    ta = TAU_ALPHA
    ul = UL_BASE
    f_p = F_PRIME
    
    # Inject Physical Faults (Calibrated for distinct detection)
    if fault_type == "Dust Accumulation":
        ta *= 0.60  # 40% reduction in optical gain
    elif fault_type == "Heat Leakage":
        ul *= 8.0   # Severe heat loss (8x) ensures physical detection
    elif fault_type == "Pump Degradation":
        f_p *= 0.6  # Significant internal fouling/scaling
    
    # Calculate Dynamic Heat Removal Factor
    fr = calculate_fr(flow_rate, CP, AREA, ul, f_p)
    
    # Hottel-Whillier-Bliss Equation
    term1 = ta * irradiance
    term2 = ul * (t_in - ambient_temp)
    
    q_useful_per_area = fr * (term1 - term2)
    
    if q_useful_per_area < 0:
        q_useful_per_area = 0
        
    q_gain = q_useful_per_area * AREA
    
    if flow_rate > 0:
        delta_t = q_gain / (flow_rate * CP)
        t_out = t_in + delta_t
    else:
        t_out = t_in 
        
    # Sensor Drift: Systematic reading error
    if fault_type == "Sensor Drift":
        t_out += 8.5  # Distinct reading error (+8.5C)

    obs_q_gain, obs_q_loss, obs_efficiency = calculate_performance(irradiance, t_in, t_out, flow_rate, ambient_temp)
    
    return t_out, obs_q_gain, obs_q_loss, obs_efficiency

def rule_based_diagnosis(irradiance, t_in, t_out, mass_flow_rate, efficiency, q_gain, q_loss):
    """
    Determines faults based on the recalibrated physics model.
    """
    # 1. Sensor Drift: Unrealistically high efficiency
    if efficiency > 81.0:
        return "Sensor Drift", 92.0

    # 2. Pump Degradation: Extreme Temp Delta or Low effective flow
    if mass_flow_rate < 0.012 or (t_out - t_in) > 42.0:
        return "Pump Degradation", 95.0

    # 3. Dust Accumulation: Low efficiency at high sun
    if irradiance > 600 and efficiency < 55.0:
        return "Dust Accumulation", 88.0

    # 4. Heat Leakage: High loss-to-gain ratio
    if q_gain > 0 and (q_loss / q_gain) > 0.8 and efficiency < 52.0:
        return "Heat Leakage", 85.0

    # 5. Low Efficiency: 
    if efficiency < 40.0:
        return "Low Efficiency", 75.0

    return "Normal Condition", 100.0
