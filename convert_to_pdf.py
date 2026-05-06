#!/usr/bin/env python3
"""
Script para converter DOCUMENTACAO_SISTEMA.md para PDF
Usa reportlab para máxima compatibilidade no Windows
"""
import os
import re
from pathlib import Path

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle, StyleSheet1
    from reportlab.lib.units import mm, inch
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
    from reportlab.lib import colors
except ImportError:
    print("Instalando reportlab...")
    os.system("pip install reportlab")
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle, StyleSheet1
    from reportlab.lib.units import mm, inch
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
    from reportlab.lib import colors

# Caminhos
workspace_path = Path(__file__).parent
md_file = workspace_path / "DOCUMENTACAO_SISTEMA.md"
pdf_file = workspace_path / "DOCUMENTACAO_SISTEMA.pdf"

# Ler arquivo Markdown
print(f"Lendo arquivo: {md_file}")
with open(md_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Configurar PDF
print(f"Criando PDF: {pdf_file}")
doc = SimpleDocTemplate(
    str(pdf_file),
    pagesize=A4,
    rightMargin=15*mm,
    leftMargin=15*mm,
    topMargin=15*mm,
    bottomMargin=15*mm,
    title='INDÚSTRIA VISUAL - Sistema de Gestão de Instalações'
)

# Criar estilos personalizados
styles = getSampleStyleSheet()

# Estilo para título
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=24,
    textColor=colors.HexColor('#1e40af'),
    spaceAfter=12,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

# Estilo para h2
h2_style = ParagraphStyle(
    'CustomH2',
    parent=styles['Heading2'],
    fontSize=16,
    textColor=colors.HexColor('#1e40af'),
    spaceAfter=10,
    spaceBefore=10,
    fontName='Helvetica-Bold'
)

# Estilo para h3
h3_style = ParagraphStyle(
    'CustomH3',
    parent=styles['Heading3'],
    fontSize=13,
    textColor=colors.HexColor('#2563eb'),
    spaceAfter=8,
    spaceBefore=8,
    fontName='Helvetica-Bold'
)

# Estilo para corpo
body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=11,
    alignment=TA_JUSTIFY,
    spaceAfter=8
)

# Estilo para código
code_style = ParagraphStyle(
    'Code',
    parent=styles['Normal'],
    fontSize=9,
    fontName='Courier',
    textColor=colors.HexColor('#333333'),
    leftIndent=10,
    spaceAfter=5
)

# Lista de elementos para o PDF
elements = []

# Processar linhas do Markdown
lines = content.split('\n')
i = 0
while i < len(lines):
    line = lines[i]
    
    # Título principal
    if line.startswith('# ') and not line.startswith('# #'):
        text = line[2:].strip()
        elements.append(Paragraph(text, title_style))
        elements.append(Spacer(1, 4*mm))
    
    # Heading 2
    elif line.startswith('## '):
        text = line[3:].strip()
        elements.append(Paragraph(text, h2_style))
    
    # Heading 3
    elif line.startswith('### '):
        text = line[4:].strip()
        elements.append(Paragraph(text, h3_style))
    
    # Heading 4
    elif line.startswith('#### '):
        text = line[5:].strip()
        elements.append(Paragraph(text, h2_style))
    
    # Linhas vazias
    elif line.strip() == '':
        elements.append(Spacer(1, 3*mm))
    
    # Linhas horizontais
    elif line.strip() in ['---', '***', '___']:
        elements.append(Spacer(1, 1*mm))
    
    # Listas
    elif line.strip().startswith('- ') or line.strip().startswith('* '):
        text = line.strip()[2:].strip()
        elements.append(Paragraph(f"• {text}", body_style))
    
    # Números em listas
    elif re.match(r'^\d+\.\s', line.strip()):
        text = re.sub(r'^\d+\.\s', '', line.strip())
        elements.append(Paragraph(text, body_style))
    
    # Blocos de código
    elif line.strip().startswith('```'):
        i += 1
        code_lines = []
        while i < len(lines) and not lines[i].strip().startswith('```'):
            code_lines.append(lines[i])
            i += 1
        code_text = '\n'.join(code_lines).strip()
        if code_text:
            for code_line in code_text.split('\n'):
                elements.append(Paragraph(code_line.replace('<', '&lt;').replace('>', '&gt;'), code_style))
        elements.append(Spacer(1, 2*mm))
    
    # Tabelas (simples)
    elif '|' in line and i + 1 < len(lines) and '|' in lines[i + 1]:
        rows = []
        # Cabeçalho
        header = [cell.strip() for cell in line.split('|')[1:-1]]
        rows.append(header)
        
        i += 1
        # Pular linha de separação
        i += 1
        
        # Dados
        while i < len(lines) and '|' in lines[i]:
            cells = [cell.strip() for cell in lines[i].split('|')[1:-1]]
            rows.append(cells)
            i += 1
        i -= 1
        
        if rows:
            # Criar tabela
            table_data = [[Paragraph(cell[:100], body_style) for cell in row] for row in rows]
            t = Table(table_data, colWidths=[50*mm] * len(rows[0]) if rows else [50*mm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0e7ff')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f0f9ff')),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#dbeafe')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f9ff')]),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 3*mm))
    
    # Parágrafos normais
    elif line.strip() and not line.startswith('|'):
        # Limpar markdown inline
        text = line.strip()
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
        text = re.sub(r'`(.+?)`', r'<font face="Courier">\1</font>', text)
        
        if text:
            elements.append(Paragraph(text, body_style))
    
    i += 1

# Gerar PDF
try:
    doc.build(elements)
    print(f"✓ PDF criado com sucesso: {pdf_file}")
    print(f"Tamanho: {os.path.getsize(pdf_file) / 1024:.2f} KB")
except Exception as e:
    print(f"✗ Erro ao gerar PDF: {e}")
