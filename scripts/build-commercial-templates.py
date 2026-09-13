from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'apps/api/templates'
LOGO=BASE/'apps/web/public/brand/logo.png'
OUT.mkdir(parents=True, exist_ok=True)

NAVY=RGBColor(20, 45, 91)
TEAL=RGBColor(0, 118, 132)
DARK=RGBColor(38, 50, 56)
GRAY=RGBColor(96, 108, 118)
LIGHT_BG='EAF5F7'
ACCENT_BG='E6EFF7'
BORDER='B9C6D3'


def set_cell_shading(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    tcPr.append(shd)


def set_cell_border(cell, color=BORDER, sz='8'):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = tcPr.first_child_found_in('w:tcBorders')
    if tcBorders is None:
        tcBorders = OxmlElement('w:tcBorders')
        tcPr.append(tcBorders)
    for edge in ('top', 'left', 'bottom', 'right'):
        element = tcBorders.find(qn(f'w:{edge}'))
        if element is None:
            element = OxmlElement(f'w:{edge}')
            tcBorders.append(element)
        element.set(qn('w:val'), 'single')
        element.set(qn('w:sz'), sz)
        element.set(qn('w:color'), color)


def prevent_row_split(row):
    trPr = row._tr.get_or_add_trPr()
    cantSplit = OxmlElement('w:cantSplit')
    trPr.append(cantSplit)


def style_doc(doc):
    sec=doc.sections[0]
    sec.top_margin = Cm(1.2)
    sec.bottom_margin = Cm(1.2)
    sec.left_margin = Cm(1.5)
    sec.right_margin = Cm(1.5)
    sec.header_distance = Cm(0.5)
    sec.footer_distance = Cm(0.5)
    styles=doc.styles
    normal=styles['Normal']
    normal.font.name='Aptos'
    normal.font.size=Pt(9.5)
    normal.font.color.rgb=DARK
    pf=normal.paragraph_format
    pf.space_after=Pt(3)
    pf.line_spacing=1.0

    for name,size,bold,color in [
        ('Title', 20, True, NAVY),
        ('Heading 1', 13.5, True, NAVY),
        ('Heading 2', 11.5, True, TEAL),
    ]:
        st=styles[name]
        st.font.name='Aptos'
        st.font.size=Pt(size)
        st.font.bold=bold
        st.font.color.rgb=color
        st.paragraph_format.space_before=Pt(4)
        st.paragraph_format.space_after=Pt(3)


def add_header_footer(doc, header_title, header_subtitle):
    sec=doc.sections[0]
    header=sec.header
    table=header.add_table(rows=1, cols=2, width=Cm(17))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    left, right = table.rows[0].cells
    p=left.paragraphs[0]
    if LOGO.exists():
        run=p.add_run()
        run.add_picture(str(LOGO), width=Cm(2.7))
    rp=right.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run=rp.add_run(header_title)
    run.bold=True
    run.font.size=Pt(9)
    run.font.color.rgb=NAVY
    r2=rp.add_run(f"\n{header_subtitle}")
    r2.font.size=Pt(7.5)
    r2.font.color.rgb=GRAY

    footer=sec.footer
    ftable=footer.add_table(rows=1, cols=2, width=Cm(17))
    ftable.alignment = WD_TABLE_ALIGNMENT.CENTER
    fleft, fright = ftable.rows[0].cells
    fleft.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    if LOGO.exists():
        p=fleft.paragraphs[0]
        run=p.add_run()
        run.add_picture(str(LOGO), width=Cm(2.0))
    p=fright.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run=p.add_run('PONTO CERTO · Documento comercial confidencial')
    run.font.size=Pt(7.5)
    run.font.color.rgb=GRAY


def add_title_block(doc, title, subtitle):
    p=doc.add_paragraph(style='Title')
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run(title)
    p2=doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r=p2.add_run(subtitle)
    r.font.size=Pt(10.5)
    r.font.color.rgb=GRAY


def add_info_band(doc, items):
    table=doc.add_table(rows=1, cols=len(items))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    prevent_row_split(table.rows[0])
    for idx,(label, value) in enumerate(items):
        cell=table.rows[0].cells[idx]
        set_cell_shading(cell, ACCENT_BG)
        set_cell_border(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p=cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r=p.add_run(label+'\n')
        r.font.size=Pt(7.5)
        r.font.bold=True
        r.font.color.rgb=GRAY
        r2=p.add_run(str(value))
        r2.font.size=Pt(9.8)
        r2.font.bold=True
        r2.font.color.rgb=NAVY
    doc.add_paragraph('')


def add_section(doc, title, body=None, bullets=None):
    doc.add_paragraph(title, style='Heading 1')
    if body:
        for paragraph in body if isinstance(body, list) else [body]:
            doc.add_paragraph(paragraph)
    if bullets:
        for item in bullets:
            p=doc.add_paragraph(style='List Bullet')
            p.paragraph_format.left_indent = Cm(0.35)
            p.paragraph_format.space_after = Pt(1)
            run=p.add_run(item)
            run.font.size=Pt(9.3)


def add_key_value_table(doc, rows, widths=(4.5, 11.2)):
    table=doc.add_table(rows=0, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for label, value in rows:
        row=table.add_row()
        prevent_row_split(row)
        cells=row.cells
        cells[0].width=Cm(widths[0])
        cells[1].width=Cm(widths[1])
        set_cell_border(cells[0]); set_cell_border(cells[1])
        set_cell_shading(cells[0], LIGHT_BG)
        for cell in cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p=cells[0].paragraphs[0]
        rr=p.add_run(label)
        rr.font.bold=True; rr.font.color.rgb=NAVY; rr.font.size=Pt(9.3)
        p2=cells[1].paragraphs[0]
        rv=p2.add_run(str(value))
        rv.font.size=Pt(9.3)
    doc.add_paragraph('')


def add_grid_table(doc, headers, rows, widths=None, shade=LIGHT_BG, font_size=9.3):
    table=doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    if widths:
        for i,w in enumerate(widths):
            table.columns[i].width = Cm(w)
    hdr=table.rows[0].cells
    prevent_row_split(table.rows[0])
    for i,h in enumerate(headers):
        set_cell_shading(hdr[i], shade)
        set_cell_border(hdr[i])
        p=hdr[i].paragraphs[0]
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        r=p.add_run(h)
        r.font.bold=True; r.font.color.rgb=NAVY; r.font.size=Pt(9.3)
    for row_data in rows:
        row=table.add_row()
        prevent_row_split(row)
        cells=row.cells
        for i,val in enumerate(row_data):
            set_cell_border(cells[i])
            p=cells[i].paragraphs[0]
            p.alignment=WD_ALIGN_PARAGRAPH.LEFT
            r=p.add_run(str(val))
            r.font.size=Pt(font_size)
    doc.add_paragraph('')


def build_proposal():
    doc=Document()
    style_doc(doc)
    add_header_footer(doc, 'PROPOSTA COMERCIAL', 'Sistema de Gestão de Jornada')
    add_title_block(doc, 'PROPOSTA COMERCIAL — PONTO CERTO', '{{empresa_nome}}')
    add_info_band(doc, [
        ('Proposta', '{{numero_proposta}}'),
        ('Data de emissão', '{{data_proposta}}'),
        ('Validade', '{{data_validade}}'),
        ('Plano', '{{plano_nome}}'),
    ])
    add_section(doc, '1. Apresentação da proposta', [
        'Apresentamos a proposta comercial do PONTO CERTO para implantação da solução de controle de jornada e gestão de ponto eletrônico da {{empresa_nome}}, inscrita no CNPJ {{empresa_cnpj}}.',
        'A solução contempla ambiente web administrativo, PWA para iPhone, aplicativo Android, registro online e offline, captura de selfie, geolocalização, biometria do dispositivo, jornadas, relatórios e recursos adicionais conforme contratação.',
    ])
    add_section(doc, '2. Resumo comercial')
    add_key_value_table(doc, [
        ('Empresa', '{{empresa_nome}}'),
        ('CNPJ', '{{empresa_cnpj}}'),
        ('Responsável', '{{responsavel}}'),
        ('Contato', '{{email}} · {{telefone}}'),
        ('Plano contratado', '{{plano_nome}}'),
        ('Limite de funcionários', '{{limite_funcionarios}}'),
        ('Filiais incluídas', '{{limite_filiais}}'),
        ('Prazo de implantação', '{{prazo_implantacao}} dias'),
    ])
    add_section(doc, '3. Recursos contemplados', body='Os recursos abaixo correspondem à configuração comercial desta proposta e servirão como referência para a contratação.')
    add_key_value_table(doc, [
        ('Recursos contratados', '{{recursos}}'),
        ('Observações comerciais', '{{observacoes}}'),
    ])
    add_section(doc, '4. Funcionalidades da plataforma', bullets=[
        'Registro de ponto online e offline com sincronização automática após reconexão.',
        'Captura de selfie e possibilidade de refazer a foto antes da marcação.',
        'Geolocalização com precisão e bloqueio fora do raio configurado.',
        'Aplicativo Android com biometria nativa, vínculo de aparelho e fila offline.',
        'PWA para iPhone com câmera, localização e sincronização.',
        'Cadastro de funcionários, jornadas, escalas, locais de trabalho, grupos e ocorrências.',
        'Relatórios gerenciais, banco de horas, horas extras, exportações e auditoria.',
        'Compatibilidade de exportação para ERPs como Domínio, Sage e Questor.',
    ])
    add_section(doc, '5. Conformidade legal e tecnológica', [
        'O PONTO CERTO é uma solução digital para controle de jornada com arquitetura adequada ao registro eletrônico de ponto via REP-P, observando as exigências aplicáveis da Portaria MTP nº 671/2021, do art. 74 da CLT, do Decreto nº 10.854/2021 e demais normas correlatas.',
    ], bullets=[
        'Rastreabilidade das marcações e consistência dos eventos registrados.',
        'Armazenamento estruturado de dados, logs e evidências do processo de marcação.',
        'Segregação de perfis, permissões administrativas e trilha de auditoria.',
        'Suporte à gestão de jornada, horas extras, exceções e aprovações.',
    ])
    add_section(doc, '6. Benefícios esperados para a empresa', bullets=[
        'Redução de rotinas manuais e maior organização da operação de jornada.',
        'Mais previsibilidade para gestão de horas extras, faltas, atrasos e escalas.',
        'Rastreabilidade das marcações com evidências de foto, localização e origem offline.',
        'Suporte à auditoria interna e à exportação de dados para folha, contabilidade e ERPs.',
        'Acompanhamento centralizado por gestores com perfis e permissões controladas.',
    ])
    add_section(doc, '7. Investimento comercial')
    add_grid_table(doc, ['Item', 'Condição', 'Valor'], [
        ['Licença mensal Ponto Certo', 'Plano {{plano_nome}} · até {{limite_funcionarios}} colaboradores', '{{valor_mensal}} / mês'],
        ['Implantação e parametrização', 'Pagamento único', '{{valor_implantacao}}'],
        ['Exportação para folha / ERP', 'Conforme recursos contratados', 'Incluso na mensalidade'],
    ], widths=(5.2, 7.3, 3.5), font_size=8.8)
    add_section(doc, '8. Condições gerais', bullets=[
        'Esta proposta possui validade até {{data_validade}}.',
        'Os valores apresentados consideram o escopo e os recursos informados neste documento.',
        'Alterações futuras de plano ou de recursos não modificam retroativamente esta proposta.',
        'A contratação formal ocorrerá mediante aprovação comercial e geração do respectivo contrato.',
    ])
    p=doc.add_paragraph()
    p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    run=p.add_run('PONTO CERTO agradece a oportunidade e permanece à disposição para esclarecimentos.')
    run.bold=True; run.font.color.rgb=TEAL; run.font.size=Pt(10)
    doc.save(OUT/'proposta-ponto-certo.docx')


def build_contract():
    doc=Document()
    style_doc(doc)
    add_header_footer(doc, 'CONTRATO COMERCIAL', 'Licença de uso da plataforma PONTO CERTO')
    add_title_block(doc, 'CONTRATO DE LICENÇA DE USO — PONTO CERTO', '{{empresa_nome}}')
    add_info_band(doc, [
        ('Contrato', '{{numero_contrato}}'),
        ('Proposta', '{{numero_proposta}}'),
        ('Data', '{{data_contrato}}'),
        ('Início de vigência', '{{inicio_vigencia}}'),
    ])
    add_section(doc, '1. Partes', [
        'PONTO CERTO, doravante denominada CONTRATADA, e {{empresa_nome}}, inscrita no CNPJ {{empresa_cnpj}}, doravante denominada CONTRATANTE, neste ato representada por {{representante_cliente}}, celebram o presente contrato de licença de uso da plataforma.',
    ])
    add_section(doc, '2. Objeto', ['O presente contrato tem por objeto a concessão de licença de uso da plataforma PONTO CERTO para gestão de jornada, controle de ponto, acompanhamento administrativo e utilização dos recursos contratados.'])
    add_section(doc, '3. Escopo e recursos contratados')
    add_key_value_table(doc, [
        ('Plano', '{{plano_nome}}'),
        ('Recursos liberados', '{{recursos}}'),
        ('Limite de funcionários', '{{limite_funcionarios}}'),
        ('Limite de filiais', '{{limite_filiais}}'),
    ])
    add_section(doc, '4. Implantação, valores e pagamento')
    add_grid_table(doc, ['Descrição', 'Condição', 'Valor'], [
        ['Mensalidade', 'Cobrança recorrente · vencimento dia {{dia_vencimento}} · {{forma_pagamento}}', '{{valor_mensal}}'],
        ['Implantação', 'Parametrização inicial conforme proposta {{numero_proposta}}', '{{valor_implantacao}}'],
        ['Prazo contratual', '{{prazo_contratual}}', 'Reajuste: {{regra_reajuste}}'],
    ], widths=(4.5, 8.3, 3.2), font_size=8.8)
    add_section(doc, '5. Obrigações da contratada', bullets=[
        'Disponibilizar a plataforma e os recursos contratados dentro das condições gerais do serviço.',
        'Promover atualizações evolutivas e corretivas compatíveis com a operação do produto.',
        'Manter controles razoáveis de segurança, autenticação e segregação de usuários.',
        'Prestar suporte conforme os canais e condições operacionais informados comercialmente.',
    ])
    add_section(doc, '6. Obrigações da contratante', bullets=[
        'Fornecer dados corretos para parametrização e manter atualizados os usuários autorizados.',
        'Zelar pela guarda de credenciais e pelo uso adequado dos perfis administrativos concedidos.',
        'Disponibilizar infraestrutura mínima de acesso à internet e dispositivos compatíveis.',
        'Observar a legislação aplicável ao controle de jornada e as regras internas de uso.',
    ])
    add_section(doc, '7. Segurança, confidencialidade e LGPD', [
        'As partes comprometem-se a tratar como confidenciais as informações acessadas em razão deste contrato, adotando medidas compatíveis com a natureza dos dados tratados.',
        'Quando houver tratamento de dados pessoais, este ocorrerá conforme a finalidade da plataforma, os limites contratuais e a legislação aplicável, inclusive a LGPD.',
    ])
    add_section(doc, '8. Vigência, rescisão e foro', [
        'Este contrato entra em vigor em {{inicio_vigencia}} e permanecerá válido pelo prazo de {{prazo_contratual}}, observadas as condições de renovação, cancelamento e rescisão previstas entre as partes.',
        'Eventuais controvérsias oriundas deste instrumento serão dirimidas no foro de {{foro}}, com renúncia a qualquer outro, por mais privilegiado que seja.',
    ])
    add_section(doc, '9. Observações adicionais', body='{{observacoes}}')
    doc.add_paragraph('10. Assinaturas', style='Heading 1')
    add_grid_table(doc, ['CONTRATANTE', 'CONTRATADA'], [[
        '____________________________________\n{{representante_cliente}}\n{{empresa_nome}}\nE-mail: {{email}} · Telefone: {{telefone}}',
        '____________________________________\n{{representante_ponto_certo}}\nPONTO CERTO',
    ]], widths=(8.1, 8.1), shade=ACCENT_BG, font_size=8.8)
    p=doc.add_paragraph()
    p.add_run('Data do contrato: ').bold = True
    p.add_run('{{data_contrato}}')
    p2=doc.add_paragraph()
    rr=p2.add_run('Importante: este modelo comercial deve ser submetido à revisão jurídica antes da utilização definitiva.')
    rr.italic=True; rr.font.color.rgb=GRAY; rr.font.size=Pt(8.5)
    doc.save(OUT/'contrato-ponto-certo.docx')

if __name__ == '__main__':
    build_proposal()
    build_contract()
    print('templates generated in', OUT)
