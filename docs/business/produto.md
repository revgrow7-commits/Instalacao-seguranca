# Produto — Indústria Visual (instal-visual.com.br)

## O que é

Sistema web de gestão operacional para empresas de comunicação visual. Controla o ciclo completo de uma instalação: desde a entrada do job no ERP até a comprovação fotográfica em campo com GPS e horário.

---

## Público-alvo

| Perfil | Quem são | O que fazem no sistema |
|---|---|---|
| **Gestores** (admin / manager) | Gerentes de produção, coordenadores de campo | Importam jobs, agendam instalações, acompanham check-ins, consultam relatórios |
| **Instaladores** (installer) | Profissionais de campo que aplicam adesivos, lonas, ACM, painéis | Recebem agenda, registram check-in/checkout com foto e GPS a partir do celular |

Setor: empresas de comunicação visual que terceirizam ou gerenciam equipe própria de instalação.

---

## Problemas que resolve

### 1. Rastreabilidade de instalação em campo
Antes: o gestor não sabia se o instalador havia chegado ao local, quando saiu, nem se o trabalho foi concluído. Agora: cada item de um job tem check-in e checkout independentes com timestamp do servidor e coordenadas GPS capturadas no celular.

### 2. Comprovação fotográfica com GPS e horário
A foto de check-in e checkout é capturada no momento da ação (câmera do celular), armazenada no Supabase Storage e vinculada ao registro. O sistema grava as coordenadas GPS do evento, independentemente dos metadados EXIF da imagem.

### 3. Produtividade por instalador e por família de produto
O sistema calcula `m²/hora` por instalador e por família de produto (adesivo, lona, ACM, etc.), usando o tempo líquido de execução (descontadas pausas registradas). Os relatórios permitem identificar gargalos e benchmarks de produção.

### 4. Eliminação de planilhas e controle manual
Os jobs são importados automaticamente do ERP Holdprint via API (cron diário às 06:00 BRT). O agendamento, a atribuição de instaladores e o acompanhamento de status são feitos no sistema, sem Excel.

### 5. Visitas técnicas antes da instalação
Para jobs complexos, o sistema gerencia o ciclo de visitas técnicas (VT): solicitação → agendamento → execução → relatório com fotos e medições → envio por email ao cliente.

---

## Fluxo de valor central

```
Holdprint ERP
     |
     | importação automática (cron 06:00 BRT) ou manual
     v
  job criado com status "aguardando"
     |
     | gestor atribui instaladores e agenda data
     v
  job agendado — aparece na agenda do instalador (PWA mobile)
     |
     | instalador faz check-in no local (foto + GPS)
     v
  execução — item por item, com possibilidade de pausa
     |
     | instalador faz checkout (foto + GPS)
     v
  job concluído — dados disponíveis em relatórios
```

---

## Métricas de sucesso

| Métrica | Descrição | Onde verificar |
|---|---|---|
| Taxa de jobs com check-in completo | % de jobs finalizados com foto de entrada e saída | `/reports` — Relatórios Unificados |
| Produtividade m²/hora por instalador | Eficiência de execução por profissional | `/reports/installer` — Relatório por Instalador |
| Produtividade m²/hora por família de produto | Benchmark por tipo de material | `/reports/family` e `/reports/kpis` |
| Tempo médio de execução por job | Duração real vs. estimada | `/reports` |
| Alertas de GPS | Checkouts fora do raio de 500m do local | Dashboard admin — tabela `location_alerts` |
| Tempo de importação Holdprint | Lag entre entrada no ERP e disponibilidade no sistema | `/admin/scheduler` — última sincronização |

---

## Limites e restrições atuais (2026-06-11)

- Sem suporte a múltiplas filiais em relatórios cruzados (filiais POA e SP existem no banco mas os relatórios não agrupam por filial).
- Jobs sem coordenadas no cadastro não permitem validação de raio GPS no checkout.
- Fotos enviadas antes de 2025 podem estar em base64 no banco (fallback legado) em vez de URL do Storage.
- Visitas técnicas (`/visitas-tecnicas`) ficam visíveis para instaladores mas a criação/agendamento é restrita a admin/manager.
