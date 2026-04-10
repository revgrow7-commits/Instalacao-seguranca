#!/bin/bash
# Deploy Script - Industria Visual

echo "============================================"
echo "   DEPLOY INDUSTRIA VISUAL - VERCEL"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI não encontrado${NC}"
    echo "Instale com: npm i -g vercel"
    exit 1
fi

echo -e "${GREEN}✅ Vercel CLI encontrado${NC}"
echo ""

# Menu
echo "O que deseja fazer?"
echo "1) Deploy Backend (API)"
echo "2) Deploy Frontend"
echo "3) Deploy Ambos"
echo "4) Apenas verificar configuração"
echo ""
read -p "Escolha [1-4]: " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}📦 Deploying Backend...${NC}"
        cd /app/backend
        vercel --prod
        ;;
    2)
        echo ""
        echo -e "${YELLOW}🎨 Deploying Frontend...${NC}"
        cd /app/frontend
        yarn build
        vercel --prod
        ;;
    3)
        echo ""
        echo -e "${YELLOW}📦 Deploying Backend...${NC}"
        cd /app/backend
        vercel --prod
        
        echo ""
        echo -e "${YELLOW}🎨 Deploying Frontend...${NC}"
        cd /app/frontend
        yarn build
        vercel --prod
        ;;
    4)
        echo ""
        echo "=== VERIFICAÇÃO DE CONFIGURAÇÃO ==="
        echo ""
        echo "Backend:"
        echo "  - vercel.json: $([ -f /app/backend/vercel.json ] && echo '✅' || echo '❌')"
        echo "  - api/index.py: $([ -f /app/backend/api/index.py ] && echo '✅' || echo '❌')"
        echo "  - requirements.txt: $([ -f /app/backend/requirements.txt ] && echo '✅' || echo '❌')"
        echo ""
        echo "Frontend:"
        echo "  - vercel.json: $([ -f /app/frontend/vercel.json ] && echo '✅' || echo '❌')"
        echo "  - package.json: $([ -f /app/frontend/package.json ] && echo '✅' || echo '❌')"
        echo ""
        echo "Variáveis de ambiente:"
        cat /app/backend/.env.vercel | grep -v "^#" | grep -v "^$" | while read line; do
            var=$(echo $line | cut -d'=' -f1)
            echo "  - $var: ✅"
        done
        ;;
    *)
        echo "Opção inválida"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Concluído!${NC}"
