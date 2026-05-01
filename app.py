from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np
from tensorflow.keras.models import load_model
from fastapi.middleware.cors import CORSMiddleware
from scipy.sparse import hstack

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── LOAD MODELS ───
model_cat = joblib.load("models/expense_classifier_v1.pkl")
tfidf     = joblib.load("models/tfidf_vectorizer_v1.pkl")
le        = joblib.load("models/label_encoder_v1.pkl")

model_anom = joblib.load("models/anomaly_isolation_forest_v1.pkl")
scaler_anom = joblib.load("models/anomaly_scaler_v1.pkl")

model_lstm = load_model("models/forecast_lstm_v1.keras")
scaler_ts  = joblib.load("models/forecast_scaler_v1.pkl")

# ─── INPUT CLASSES ───
class CatInput(BaseModel):
    merchant: str
    description: str
    amount: float

class AnomalyInput(BaseModel):
    features: list

class ForecastInput(BaseModel):
    last_30_days: list

@app.get("/")
def home():
    return {"message": "AI Finance Tracker API Running"}

# ─── CATEGORY ───
@app.post("/predict/category")
def predict_category(data: CatInput):
    text = data.merchant + " " + data.description
    X_text = tfidf.transform([text])
    X_amount = np.array([[data.amount]])

    X = hstack([X_text, X_amount])
    pred = model_cat.predict(X)
    category = le.inverse_transform(pred)[0]

    return {"category": category}

# ─── ANOMALY ───
@app.post("/predict/anomaly")
def predict_anomaly(data: AnomalyInput):
    X = np.array(data.features).reshape(1, -1)
    X_scaled = scaler_anom.transform(X)

    pred = model_anom.predict(X)
    result = "Fraud 🚨" if pred[0] == -1 else "Normal ✅"

    return {"result": result}

# ─── FORECAST ───
@app.post("/predict/forecast")
def forecast(data: ForecastInput):
    arr = np.array(data.last_30_days).reshape(-1, 1)
    arr_scaled = scaler_ts.transform(arr)

    X = arr_scaled.reshape(1, len(arr_scaled), 1)
    pred = model_lstm.predict(X)

    result = scaler_ts.inverse_transform(pred)[0][0]

    return {"prediction": float(result)}