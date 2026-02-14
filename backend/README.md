
# Solar Thermal System Backend

This project contains the backend system for the "Web-Based Solar Thermal System Performance Evaluation and Fault Diagnosis" project.

## Project Structure

- `app/`: (Not used in this flat structure, code is in `backend/`)
- `ml/`: Contains the machine learning training script (`train_model.py`) and where the model (`fault_detector.pkl`) will be saved.
- `utils/`: Contains the physics simulation logic (`thermal_physics.py`).
- `schemas.py`: Data validation models.
- `main.py`: The FastAPI server entry point.
- `requirements.txt`: Python dependencies.

## Setup Instructions

1. **Install Python**: Ensure Python 3.8+ is installed on your system.

2. **Install Dependencies**:
   Open a terminal in the project root and run:
   ```bash
   pip install -r requirements.txt
   ```

3. **Train the ML Model**:
   Before running the server, you must generate the synthetic dataset and train the fault detection model.
   ```bash
   python backend/ml/train_model.py
   ```
   This will create a `fault_detector.pkl` file in the `backend/ml/` directory.

4. **Run the Server**:
   Start the API server:
   ```bash
   python backend/main.py
   ```
   The server will start at `http://localhost:8000`.

## API Documentation

Once the server is running, you can access the interactive API documentation at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Features

- **Simulation**: `/simulate` - Simulates system behavior based on physical formulas.
- **Performance Analysis**: `/analyze-performance` - Compares actual vs ideal performance.
- **Fault Detection**: `/detect-fault` - Uses Machine Learning to classify system faults.
- **Dashboard**: `/dashboard-summary` - Provides system health statistics.
