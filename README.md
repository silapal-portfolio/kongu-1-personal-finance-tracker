💸 FinanceAI — AI-Powered Personal Finance Tracker
An intelligent expense tracking system that classifies transactions, detects anomalies, and forecasts next month's spending using Machine Learning.
Show Image Show Image Show Image Show Image Show Image

🤖 ML Models
ModelAlgorithmPurposeCategory ClassifierXGBoost + TF-IDFClassifies into Food, Shopping, Transport, Entertainment, TechnologyAnomaly DetectorIsolation ForestFlags unusually high transactionsSpending ForecasterLSTM (Deep Learning)Predicts next month's total expense

⚡ Features

🍔 Auto-categorizes transactions using NLP + keyword matching
🚨 Real-time anomaly alerts with spike explanation
🔮 LSTM-powered next month forecast with trend insight
📊 Daily, Weekly, Monthly charts (Chart.js)
💾 Browser localStorage — no login needed
🌐 FastAPI REST backend serving all 3 models


🏗️ Architecture
User Input → Keyword Matcher → XGBoost (Food/Shopping)
                                      ↓
                             Isolation Forest (Anomaly)
                                      ↓
                               LSTM (Forecast)
                                      ↓
                          Interactive Dashboard

🚀 Quick Start
bash# 1. Install dependencies
pip install fastapi uvicorn joblib scikit-learn xgboost tensorflow scipy

# 2. Place trained models inside /models folder

# 3. Start backend
uvicorn app:app --reload

# 4. Open index.html in browser

📁 Project Structure
FinanceAI/
├── index.html          # Frontend dashboard
├── app.js              # Charts, API calls, localStorage
├── app.py              # FastAPI backend (3 endpoints)
├── requirements.txt
└── models/
    ├── expense_classifier_v1.pkl
    ├── tfidf_vectorizer_v1.pkl
    ├── label_encoder_v1.pkl
    ├── anomaly_isolation_forest_v1.pkl
    ├── anomaly_scaler_v1.pkl
    ├── forecast_lstm_v1.keras
    └── forecast_scaler_v1.pkl

🔌 API Endpoints
MethodEndpointDescriptionPOST/predict/categoryReturns expense categoryPOST/predict/anomalyReturns Normal or FraudPOST/predict/forecastReturns predicted next month spend

🧪 Tech Stack
Python FastAPI XGBoost Scikit-learn TensorFlow/Keras HTML/CSS JavaScript Chart.js Joblib

