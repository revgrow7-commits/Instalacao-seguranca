"""
Configuration and constants for the application.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# JWT Settings
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Holdprint API Keys
HOLDPRINT_API_KEY_POA = os.environ.get('HOLDPRINT_API_KEY_POA')
HOLDPRINT_API_KEY_SP = os.environ.get('HOLDPRINT_API_KEY_SP')
HOLDPRINT_API_URL = "https://api.holdworks.ai/api-key/jobs/data"

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI')
GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email']

# Resend Email Config
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
# Production URL - fallback to instal-visual.com.br if env not set
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://instal-visual.com.br')

# Web Push Notification Config
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'bruno@industriavisual.com.br')

# GPS/Location Settings
MAX_CHECKOUT_DISTANCE_METERS = 500

# Upload directory
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Pause reasons
PAUSE_REASONS = [
    "aguardando_cliente",
    "chuva",
    "falta_material", 
    "almoco_intervalo",
    "problema_acesso",
    "problema_equipamento",
    "aguardando_aprovacao",
    "outro"
]

PAUSE_REASON_LABELS = {
    "aguardando_cliente": "Aguardando Cliente",
    "chuva": "Chuva/Intempérie",
    "falta_material": "Falta de Material",
    "almoco_intervalo": "Almoço/Intervalo",
    "problema_acesso": "Problema de Acesso",
    "problema_equipamento": "Problema com Equipamento",
    "aguardando_aprovacao": "Aguardando Aprovação",
    "outro": "Outro Motivo"
}

# Product Family Mapping
PRODUCT_FAMILY_MAPPING = {
    "Adesivos": [
        "adesivo", "vinil", "fachada adesivada", "fachada com vinil"
    ],
    "Lonas e Banners": [
        "lona", "banner", "faixa", "empena", "faixa de gradil"
    ],
    "Chapas e Placas": [
        "chapa", "placa", "acm", "acrílico", "mdf", "ps", "pvc", "polionda", 
        "policarbonato", "petg", "compensado", "xps"
    ],
    "Estruturas Metálicas": [
        "estrutura metálica", "estrutura metalica", "backdrop", "cavalete"
    ],
    "Tecidos": [
        "tecido", "bandeira", "wind banner"
    ],
    "Letras Caixa": [
        "letra caixa", "letra-caixa", "letras caixa"
    ],
    "Totens": [
        "totem"
    ],
    "Envelopamento": [
        "envelopamento"
    ],
    "Painéis Luminosos": [
        "painel backlight", "painel luminoso", "backlight"
    ],
    "Serviços": [
        "serviço", "serviços", "instalação", "entrega", "montagem", 
        "pintura", "serralheria", "solda", "corte", "aplicação"
    ],
    "Materiais Promocionais": [
        "cartaz", "flyer", "folder", "panfleto", "imã", "marca-página"
    ],
    "Produtos Terceirizados": [
        "terceirizado", "produto genérico"
    ],
    "Sublimação": [
        "sublimação", "sublimática", "sublimatico"
    ],
    "Impressão": [
        "impressão uv", "impressão latex", "impressão solvente"
    ],
    "Display/PS": [
        "display", "móbile", "mobile", "orelha de monitor"
    ],
    "Fundação/Estrutura": [
        "fundação", "sapata", "estrutura em madeira"
    ]
}
