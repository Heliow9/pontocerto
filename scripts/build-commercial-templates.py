from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'apps/api/templates'
LOGO=BASE/'apps/web/public/brand/logo.png'
OUT.mkdir(parents=True, exist_ok=True)

NAVY=RGBColor(25, 62, 103)
TEAL=RGBColor(0, 125, 140)
DARK=RGBColor(38, 50, 56)
GRAY=RGBColor(96, 108, 118)
WHITE=RGBColor(255,255,255)
LIGHT='EEF4F8'
LIGHT_TEAL='EAF7F8'
MID='D9E6F0'
BORDER='B8C8D6'
NAVY_HEX='193E67'
TEAL_HEX='007D8C'


def set_cell_shading(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr()
    shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)

def set_cell_border(cell, color=BORDER, sz='7'):
    tcPr=cell._tc.get_or_add_tcPr()
    borders=tcPr.first_child_found_in('w:tcBorders')
    if borders is None:
        borders=OxmlElement('w:tcBorders'); tcPr.append(borders)
    for edge in ('top','left','bottom','right'):
        el=borders.find(qn(f'w:{edge}'))
        if el is None:
            el=OxmlElement(f'w:{edge}'); borders.append(el)
        el.set(qn('w:val'),'single'); el.set(qn('w:sz'),sz); el.set(qn('w:color'),color)

def prevent_row_split(row):
    trPr=row._tr.get_or_add_trPr(); trPr.append(OxmlElement('w:cantSplit'))

def repeat_table_header(row):
    trPr=row._tr.get_or_add_trPr(); el=OxmlElement('w:tblHeader'); el.set(qn('w:val'),'true'); trPr.append(el)

def keep_with_next(paragraph):
    pPr=paragraph._p.get_or_add_pPr(); pPr.append(OxmlElement('w:keepNext'))

def set_vertical_align_bottom(section):
    sectPr=section._sectPr
    old=sectPr.find(qn('w:vAlign'))
    if old is not None: sectPr.remove(old)
    v=OxmlElement('w:vAlign'); v.set(qn('w:val'),'bottom'); sectPr.append(v)

def add_page_field(paragraph):
    run=paragraph.add_run(); fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); run._r.addnext(fld)

def style_doc(doc):
    sec=doc.sections[0]
    sec.top_margin=Cm(1.25); sec.bottom_margin=Cm(1.25); sec.left_margin=Cm(1.45); sec.right_margin=Cm(1.45)
    sec.header_distance=Cm(.45); sec.footer_distance=Cm(.45)
    normal=doc.styles['Normal']; normal.font.name='Aptos'; normal.font.size=Pt(9.1); normal.font.color.rgb=DARK
    normal.paragraph_format.space_after=Pt(3); normal.paragraph_format.line_spacing=1.02
    for name,size,color in [('Title',21,NAVY),('Heading 1',13.8,NAVY),('Heading 2',11.2,TEAL)]:
        st=doc.styles[name]; st.font.name='Aptos'; st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=color
        st.paragraph_format.space_before=Pt(5); st.paragraph_format.space_after=Pt(3)

def add_header_footer(doc, document_name, confidential_text):
    sec=doc.sections[0]
    header=sec.header
    table=header.add_table(rows=1,cols=2,width=Cm(17.6)); table.alignment=WD_TABLE_ALIGNMENT.CENTER
    left,right=table.rows[0].cells
    if LOGO.exists(): left.paragraphs[0].add_run().add_picture(str(LOGO),width=Cm(2.45))
    p=right.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=p.add_run(document_name); r.bold=True; r.font.size=Pt(8.7); r.font.color.rgb=NAVY
    r=p.add_run('\nPONTO CERTO | Sistema de Gestão de Jornada'); r.font.size=Pt(7.3); r.font.color.rgb=GRAY

    footer=sec.footer
    ft=footer.add_table(rows=1,cols=3,width=Cm(17.6)); ft.alignment=WD_TABLE_ALIGNMENT.CENTER
    c1,c2,c3=ft.rows[0].cells
    if LOGO.exists(): c1.paragraphs[0].add_run().add_picture(str(LOGO),width=Cm(1.75))
    p=c2.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run(confidential_text); r.font.size=Pt(7); r.font.color.rgb=GRAY
    p=c3.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=p.add_run('Página '); r.font.size=Pt(7); r.font.color.rgb=GRAY; add_page_field(p)

def add_page_break(doc):
    doc.add_page_break()

def add_title(doc,title,subtitle=None):
    p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run(title)
    if subtitle:
        p2=doc.add_paragraph(); p2.alignment=WD_ALIGN_PARAGRAPH.CENTER
        r=p2.add_run(subtitle); r.bold=True; r.font.size=Pt(10.5); r.font.color.rgb=TEAL

def add_heading(doc,title,level=1):
    p=doc.add_paragraph(title,style=f'Heading {level}'); keep_with_next(p); return p

def add_para(doc,text,bold_prefix=None,align=None,italic=False,size=None):
    p=doc.add_paragraph();
    if align: p.alignment=align
    if bold_prefix and text.startswith(bold_prefix):
        a,b=text.split(':',1); r=p.add_run(a+':'); r.bold=True; r.font.color.rgb=NAVY; p.add_run(b)
    else:
        r=p.add_run(text); r.italic=italic
    if size:
        for run in p.runs: run.font.size=Pt(size)
    return p

def add_bullets(doc,items,size=9.0):
    for item in items:
        p=doc.add_paragraph(style='List Bullet'); p.paragraph_format.left_indent=Cm(.42); p.paragraph_format.space_after=Pt(1.2)
        r=p.add_run(item); r.font.size=Pt(size)

def add_info_table(doc, rows, left_width=4.2, right_width=12.8):
    t=doc.add_table(rows=0,cols=2); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    for label,value in rows:
        row=t.add_row(); prevent_row_split(row); c1,c2=row.cells; c1.width=Cm(left_width); c2.width=Cm(right_width)
        set_cell_shading(c1,NAVY_HEX); set_cell_border(c1); set_cell_border(c2)
        p=c1.paragraphs[0]; rr=p.add_run(label); rr.bold=True; rr.font.color.rgb=WHITE; rr.font.size=Pt(9)
        p=c2.paragraphs[0]; rr=p.add_run(str(value)); rr.font.size=Pt(9.2)
    return t

def add_feature_table(doc, rows):
    t=doc.add_table(rows=1,cols=2); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    t.columns[0].width=Cm(5.15); t.columns[1].width=Cm(11.95)
    hdr=t.rows[0]; repeat_table_header(hdr); prevent_row_split(hdr)
    for i,text in enumerate(['Recurso','Descrição']):
        c=hdr.cells[i]; set_cell_shading(c,NAVY_HEX); set_cell_border(c)
        p=c.paragraphs[0]; r=p.add_run(text); r.bold=True; r.font.color.rgb=WHITE; r.font.size=Pt(8.8)
    for label,desc in rows:
        row=t.add_row(); prevent_row_split(row); c1,c2=row.cells; set_cell_border(c1); set_cell_border(c2); set_cell_shading(c1,LIGHT)
        p=c1.paragraphs[0]; r=p.add_run(label); r.bold=True; r.font.color.rgb=NAVY; r.font.size=Pt(8.1)
        p=c2.paragraphs[0]; r=p.add_run(desc); r.font.size=Pt(8.15)
    return t

def add_commercial_table(doc):
    t=doc.add_table(rows=1,cols=3); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    widths=(6.1,7.0,3.6)
    for i,w in enumerate(widths): t.columns[i].width=Cm(w)
    for i,text in enumerate(['Item','Condição','Valor']):
        c=t.rows[0].cells[i]; set_cell_shading(c,NAVY_HEX); set_cell_border(c); p=c.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        r=p.add_run(text); r.bold=True; r.font.color.rgb=WHITE; r.font.size=Pt(8.8)
    rows=[
        ('Licença Ponto Certo - Plano {{plano_nome}}','Até {{limite_funcionarios}} colaboradores','{{valor_mensal}} / mês'),
        ('Implantação e parametrização inicial','Pagamento único','{{valor_implantacao}}'),
        ('Exportação padrão para folha/ERP','Inclusa quando contratada','Incluso'),
    ]
    for data in rows:
        row=t.add_row(); prevent_row_split(row)
        for i,val in enumerate(data):
            c=row.cells[i]; set_cell_border(c); p=c.paragraphs[0]; r=p.add_run(val); r.font.size=Pt(8.7)
    return t

def build_proposal():
    doc=Document(); style_doc(doc); add_header_footer(doc,'PROPOSTA COMERCIAL','PONTO CERTO - CNPJ 67.609.840/0001-27 | Proposta comercial confidencial')

    # PAGE 1
    add_title(doc,'PROPOSTA COMERCIAL','Uma plataforma para registrar, acompanhar e agir sobre a jornada de trabalho em tempo real')
    add_info_table(doc,[('Cliente','{{empresa_nome}}'),('CNPJ','{{empresa_cnpj}}'),('Proponente','PONTO CERTO - Sistema de Gestão de Jornada'),('CNPJ','67.609.840/0001-27')])
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('Data: {{data_proposta}}  |  Validade da proposta: {{data_validade}}'); r.font.size=Pt(8.8); r.font.color.rgb=GRAY
    add_heading(doc,'1. Objetivo da proposta')
    add_para(doc,'Disponibilizar à {{empresa_nome}} uma solução moderna para gestão de jornada, controle de ponto e acompanhamento operacional, reduzindo processos manuais, facilitando o fechamento mensal e ampliando a capacidade de prevenção de horas extras, inconsistências e esquecimentos de marcação.')
    add_heading(doc,'2. Principais funcionalidades')
    rows1=[
        ('Registro de ponto online/offline','Marcação com conexão ou sem conexão à internet por aplicativo Android ou PWA para iPhone/iOS, com sincronização imediata e disponibilidade da informação para a gestão.'),
        ('Aplicativo Android','Aplicativo dedicado para smartphones e tablets Android, permitindo o registro de ponto, captura de foto, localização e demais validações definidas pela empresa.'),
        ('PWA para iPhone / iOS','Acesso pelo iPhone por aplicação web progressiva (PWA), instalável na tela inicial, sem necessidade de distribuição pela App Store.'),
        ('Registro de ponto offline','Possibilidade de registrar marcações quando não houver conexão, com armazenamento local e sincronização automática quando a conectividade for restabelecida, preservando o horário original.'),
        ('Geolocalização e geofencing','Captura da localização no momento do registro e validação de distância em relação ao local de trabalho cadastrado, com raio configurável.'),
        ('Registro fotográfico','Captura de foto do colaborador no momento da marcação, com visualização da câmera, pré-visualização da foto e opção de refazer antes da confirmação.'),
        ('Biometria do dispositivo','Validação por biometria disponível no próprio aparelho do colaborador, com possibilidade de habilitar ou desabilitar a exigência individualmente.'),
        ('Vinculação de dispositivo','Controle do aparelho autorizado para utilização por cada funcionário, conforme regras definidas pela empresa.'),
        ('Gestão de escalas e jornadas','Cadastro de horários, jornadas, intervalos, tolerâncias e regras de marcação, com acompanhamento de ocorrências.'),
    ]
    add_feature_table(doc,rows1)

    # PAGE 2
    add_page_break(doc)
    add_heading(doc,'2. Principais funcionalidades - continuação')
    rows2=[
        ('Espelho e relatórios de ponto','Consulta por funcionário, período, setor e empresa, com visualização das marcações, atrasos, ausências, horas trabalhadas e horas extras.'),
        ('Tratamento de inconsistências','Identificação de marcações ausentes, divergências de jornada e ocorrências que necessitem de conferência pelo gestor ou Departamento Pessoal.'),
        ('Acesso multiempresa e multiusuário','Estrutura multi-tenant para separar dados por empresa, com perfis administrativos e acessos distintos para gestão local e administração.'),
        ('Dashboard gerencial','Visão consolidada da operação, indicadores de marcação, pendências e eventos relevantes para acompanhamento diário.'),
        ('Exportação de dados','Geração de arquivos para utilização em rotinas de folha, contabilidade e gestão, reduzindo a necessidade de redigitação manual.'),
        ('Proteção contra marcações duplicadas','Validação no aplicativo e novamente no servidor para impedir duplicidade de eventos na mesma jornada, inclusive nas marcações offline.'),
        ('Sincronização automática do ponto offline','Envio automático das marcações pendentes quando a internet retorna, preservando o horário original da captura e evitando duplicidade durante a sincronização.'),
        ('Alertas preventivos de marcação','Lembretes automáticos antes da próxima batida prevista, inclusive alerta configurável com antecedência.'),
        ('Gestão de horas extras por grupo e funcionário','Definição de referência de horas extras por grupo de colaboradores, com possibilidade de regra individual prioritária e acompanhamento do acumulado mensal.'),
        ('Alertas de horas extras via WhatsApp','Notificações automáticas em marcos de 50%, 100% e ultrapassagem da referência, com consolidação dos avisos quando vários marcos forem atingidos simultaneamente.'),
        ('WhatsApp com múltiplos destinatários','Cadastro de diversos responsáveis por empresa, permitindo que RH, gestores e demais destinatários recebam os alertas definidos.'),
        ('Fila inteligente e controle antiflood','Fila de envio com espaçamento entre mensagens, consolidação, limite por destinatário, retentativas e validação do número antes do envio.'),
        ('Acompanhamento de entrega do WhatsApp','Monitoramento dos estados da mensagem, incluindo fila, aceite, entrega e leitura, quando disponibilizados pelo serviço de mensageria.'),
        ('Logs operacionais por empresa','Área de logs segregada por empresa para acompanhamento de eventos de WhatsApp, ponto, modo offline, sincronização, API e erros, com filtros por período.'),
        ('Retenção e rastreabilidade de logs','Armazenamento dos logs operacionais por até 90 dias, com níveis de informação, aviso e erro e separação segura entre empresas.'),
        ('Ponto remoto configurável','Possibilidade de habilitar registro remoto conforme política da empresa, com selfie, identificação do dispositivo e regras específicas de segurança para equipes externas.'),
    ]
    add_feature_table(doc,rows2)

    # PAGE 3
    add_page_break(doc)
    add_heading(doc,'3. Alertas e automações via WhatsApp')
    add_para(doc,'O PONTO CERTO utiliza notificações e automações para transformar o controle de jornada em uma ferramenta preventiva de gestão. Entre as funcionalidades disponíveis:')
    add_bullets(doc,[
        'Lembretes automáticos antes da próxima marcação prevista, inclusive alerta com antecedência configurável;',
        'Alertas de horas extras por funcionário ou grupo, com marcos de 50%, 100% e ultrapassagem da referência mensal;',
        'Consolidação automática dos marcos de horas extras quando atingidos simultaneamente, evitando mensagens repetitivas;',
        'Cadastro de múltiplos destinatários por empresa, permitindo envio para RH, gestores e responsáveis definidos;',
        'Fila inteligente de mensagens com espaçamento entre envios, limite por destinatário e retentativas graduais em caso de falha;',
        'Validação do destinatário no WhatsApp antes do envio e tratamento de números inválidos;',
        'Acompanhamento de status das mensagens, incluindo aceite, entrega e leitura quando informados pelo serviço de mensageria;',
        'Registro dos eventos de mensageria na área de Logs da empresa para acompanhamento e auditoria operacional;',
        'Possibilidade de evolução das regras de notificação por ausência de marcação, atrasos, jornadas incompletas e outras ocorrências, conforme parametrização contratada.'
    ],8.8)
    add_heading(doc,'4. Integração e exportação para sistemas de folha e ERP')
    add_para(doc,'O sistema prevê exportação parametrizável dos dados de jornada para facilitar a integração com os principais sistemas utilizados por escritórios contábeis, Departamento Pessoal e empresas, incluindo SAGE, Domínio Sistemas, Questor, TOTVS/RM, Senior, Alterdata, Contmatic e outros layouts parametrizáveis.')
    add_para(doc,'Formatos e processo: exportação em arquivos estruturados, como CSV, XLSX/TXT ou layout específico, conforme os campos exigidos pelo sistema de destino. A homologação de um layout específico depende da documentação e das regras de importação disponibilizadas pelo ERP/folha utilizado pela contratante.')
    add_heading(doc,'5. Segurança, rastreabilidade, privacidade e LGPD')
    add_bullets(doc,[
        'Autenticação de usuários e segregação de dados por empresa;',
        'Registro das informações de marcação com data, hora, usuário e evidências disponíveis;',
        'Controle de permissões conforme perfil de acesso, com separação entre Master da Empresa, Supervisores e Funcionários;',
        'Logs operacionais segregados por empresa, com retenção definida e filtros por período, módulo e nível de severidade;',
        'Monitoramento de eventos de WhatsApp, ponto, sincronização offline e erros técnicos, sem exposição de credenciais, tokens ou chaves sensíveis;',
        'Proteção contra duplicidade de marcações e preservação do horário original nas sincronizações offline;',
        'Tratamento de dados pessoais limitado às finalidades necessárias à prestação da plataforma e às configurações realizadas pela empresa usuária;',
        'Controles de acesso, registro de auditoria e medidas de proteção aplicáveis aos dados pessoais tratados na operação, observando a Lei nº 13.709/2018 (LGPD);',
        'Possibilidade de evolução de integrações, relatórios e regras conforme a necessidade operacional e contratual.'
    ],8.7)

    # PAGE 4
    add_page_break(doc)
    add_heading(doc,'6. Conformidade legal, enquadramento REP-P e Ministério do Trabalho e Emprego')
    add_para(doc,'O PONTO CERTO foi desenvolvido em observância à legislação brasileira aplicável ao controle eletrônico de jornada, com enquadramento funcional compatível com o Registrador Eletrônico de Ponto via Programa (REP-P). A base normativa considera o art. 74 da CLT, com redação dada pela Lei nº 13.874/2019, o Decreto nº 10.854/2021 e a Portaria MTP nº 671/2021, atualmente utilizada pelo Ministério do Trabalho e Emprego (MTE) como referência para os sistemas de registro eletrônico de ponto.')
    legal=[
        'Enquadramento como REP-P: a Portaria MTP nº 671/2021 reconhece o Registrador Eletrônico de Ponto via Programa (REP-P) como modalidade válida de registro eletrônico de jornada.',
        'Homologação no MTE: para REP-P não existe exigência de certificação ou homologação do programa junto ao MTE. Conforme orientação oficial do próprio Ministério e o art. 91 da Portaria nº 671/2021, o REP-P deve possuir certificado de registro de programa de computador no Instituto Nacional da Propriedade Industrial (INPI), além de atender aos requisitos técnicos aplicáveis.',
        'Atestado Técnico e Termo de Responsabilidade: nos termos do art. 89 da Portaria nº 671/2021, o desenvolvedor deve fornecer à empresa usuária o documento que declara o atendimento às exigências aplicáveis, devendo o empregador mantê-lo disponível para apresentação à Inspeção do Trabalho.',
        'Registro online e offline: o Anexo IX da Portaria nº 671/2021 admite marcações por coletor conectado ao REP-P e, excepcionalmente, em modo offline, com envio posterior das marcações assim que a conexão for restabelecida, preservando a segurança e a rastreabilidade dos dados.',
        'Arquivos e relatórios legais: o ambiente REP-P deve permitir a geração dos arquivos e relatórios exigidos pela regulamentação, incluindo Arquivo Fonte de Dados (AFD), Arquivo Eletrônico de Jornada (AEJ) e Espelho de Ponto Eletrônico, observadas as especificações oficiais vigentes.',
        'Comprovante de marcação: quando disponibilizado em meio eletrônico, o comprovante de registro de ponto deve ser fornecido ao trabalhador em PDF e atender aos requisitos de autenticidade, integridade e assinatura eletrônica previstos na Portaria.',
        'Assinaturas eletrônicas: as saídas eletrônicas regulamentares do REP-P e do programa de tratamento devem observar os padrões de assinatura e certificação digital definidos na Portaria MTP nº 671/2021, inclusive ICP-Brasil, PAdES e CAdES quando aplicáveis.'
    ]
    add_bullets(doc,legal,8.65)
    p=doc.add_paragraph(); r=p.add_run('Compromisso de conformidade: '); r.bold=True; r.font.color.rgb=NAVY
    p.add_run('o PONTO CERTO mantém sua arquitetura e evolução técnica orientadas ao cumprimento das exigências do MTE aplicáveis ao REP-P e ao programa de tratamento de registro de ponto. Eventuais atualizações normativas ou de leiaute oficial serão incorporadas ao produto de acordo com a regulamentação vigente. A utilização do sistema como REP-P pressupõe a manutenção dos requisitos formais exigidos pela Portaria, inclusive o registro do programa no INPI e a emissão do Atestado Técnico e Termo de Responsabilidade.')
    p=doc.add_paragraph(); r=p.add_run('Base legal principal: '); r.bold=True; r.font.color.rgb=NAVY
    p.add_run('CLT, art. 74; Lei nº 13.874/2019; Decreto nº 10.854/2021; Portaria MTP nº 671/2021 e alterações posteriores; Lei nº 14.063/2020, no que se refere às assinaturas eletrônicas; Lei nº 13.709/2018, no que se refere à proteção de dados pessoais.')

    # PAGE 5
    add_page_break(doc)
    add_heading(doc,'7. Benefícios esperados para a {{empresa_nome}}')
    benefits=[
        ('Menos retrabalho','Redução da digitação manual e maior organização das informações para o fechamento de ponto.'),
        ('Controle de horas extras','Alertas preventivos ajudam o gestor a agir antes do crescimento desnecessário do banco de horas ou custo de horas extras.'),
        ('Mais evidências','Foto, localização, dispositivo e dados da marcação ampliam a rastreabilidade da jornada.'),
        ('Gestão em tempo real','Acompanhamento da operação sem depender exclusivamente do fechamento mensal.'),
        ('Integração com DP','Exportações facilitam o envio das informações para folha, contabilidade e ERPs utilizados pela empresa.'),
        ('Mobilidade','Uso em obras, frentes de serviço, escritórios e equipes externas por aplicativo Android ou PWA no iPhone/iOS, conforme políticas definidas pela empresa.'),
        ('Prevenção operacional','Alertas antecipados de marcação e de horas extras permitem atuação do gestor antes da ocorrência de desvios relevantes.'),
        ('Auditoria simplificada','Área de logs por empresa facilita a identificação de falhas de sincronização, mensageria e ocorrências técnicas sem necessidade de acesso ao servidor.')
    ]
    for label,desc in benefits:
        p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(2)
        r=p.add_run(label+': '); r.bold=True; r.font.color.rgb=TEAL; p.add_run(desc)
    add_heading(doc,'8. Proposta comercial')
    add_commercial_table(doc)
    add_para(doc,'Condição de pagamento: mensalidade recorrente, com vencimento a combinar. A implantação é faturada uma única vez na ativação.')
    add_para(doc,'Responsável: {{responsavel}} | {{email}} | {{telefone}}')
    add_para(doc,'Recursos contratados: {{recursos}}. Filiais adicionais/contratadas: {{limite_filiais}}.')
    add_para(doc,'Prazo de implantação: {{prazo_implantacao}} dias. {{observacoes}}')
    add_para(doc,'As funcionalidades descritas neste documento integram o catálogo do produto. A contratação contempla somente os recursos indicados nas condições comerciais e no contrato correspondente.')
    add_para(doc,'Customizações e integrações especiais: layouts específicos, APIs de terceiros, integrações sob medida, equipamentos físicos de REP ou necessidades fora do escopo padrão poderão ser avaliados e orçados separadamente.')

    # FINAL PAGE - implementation, support and closing
    add_page_break(doc)
    add_heading(doc,'9. Escopo inicial de implantação')
    add_bullets(doc,[
        'Cadastro da empresa e parâmetros principais;',
        'Configuração inicial de jornada e regras operacionais;',
        'Cadastro/importação inicial de colaboradores em formato acordado;',
        'Configuração de locais, raio de geolocalização e regras de marcação;',
        'Orientação para uso do aplicativo Android e do PWA no iPhone/iOS;',
        'Orientação inicial para os responsáveis pela gestão;',
        'Configuração dos destinatários e regras iniciais de alertas via WhatsApp, quando contratado;',
        'Orientação sobre a área de Logs, filtros por período e acompanhamento dos eventos de mensageria e sistema, quando contratado;',
        'Validação do funcionamento do modo offline, sincronização e fluxo de captura/confirmação da selfie, quando contratado;',
        'Validação do formato de exportação destinado ao sistema de folha/ERP utilizado pela {{empresa_nome}}, quando contratado.'
    ],9.2)
    add_heading(doc,'10. Suporte, evolução e premissas de operação')
    add_bullets(doc,[
        'A implantação considera a colaboração da empresa na disponibilização das informações necessárias à parametrização e cadastro inicial;',
        'Atualizações corretivas e evolutivas da plataforma serão incorporadas conforme o ciclo de desenvolvimento do produto e os recursos contratados;',
        'Integrações de terceiros, APIs externas, mensageria, ERPs e sistemas de folha dependem também da disponibilidade e das regras técnicas desses fornecedores;',
        'O uso de câmera, localização, notificações, biometria e funcionamento em segundo plano depende das permissões e capacidades do dispositivo do usuário;',
        'Demandas específicas fora do escopo padrão poderão ser analisadas tecnicamente e, quando necessário, tratadas por proposta complementar.'
    ],9.0)
    add_heading(doc,'11. Considerações finais')
    add_para(doc,'A proposta tem como objetivo fornecer uma solução flexível e escalável para a gestão de jornada da {{empresa_nome}}, unindo controle de ponto, mobilidade, rastreabilidade, automações, alertas preventivos, operação online e offline, mensageria por WhatsApp, logs operacionais e integração com os processos de Departamento Pessoal. A solução também observa o marco regulatório aplicável ao registro eletrônico de jornada, com orientação de conformidade aos requisitos do MTE para utilização como REP-P.')
    add_heading(doc,'12. Validade e aceite comercial')
    add_para(doc,'Esta proposta é válida até {{data_validade}}. A aprovação comercial servirá de base para a geração do contrato, que preservará o plano, os limites, os recursos e as condições negociadas nesta revisão.')
    add_para(doc,'PONTO CERTO agradece a oportunidade de apresentar esta solução e permanece à disposição para esclarecimentos, parametrização do escopo e alinhamento do cronograma de implantação.',align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.save(OUT/'proposta-ponto-certo.docx')


def build_contract():
    doc=Document(); style_doc(doc); add_header_footer(doc,'CONTRATO COMERCIAL','PONTO CERTO - Contrato comercial | Documento confidencial')

    # PAGE 1
    add_title(doc,'CONTRATO DE LICENÇA DE USO - PONTO CERTO','Contrato {{numero_contrato}}')
    add_info_table(doc,[('Contratante','{{empresa_nome}}'),('CNPJ','{{empresa_cnpj}}'),('Proposta de origem','{{numero_proposta}}'),('Data do contrato','{{data_contrato}}')])
    add_heading(doc,'1. Partes')
    add_para(doc,'De um lado, PONTO CERTO, doravante denominada CONTRATADA, e, de outro, {{empresa_nome}}, inscrita no CNPJ {{empresa_cnpj}}, doravante denominada CONTRATANTE, neste ato representada por {{representante_cliente}}, resolvem celebrar o presente Contrato de Licença de Uso da Plataforma PONTO CERTO, mediante as cláusulas e condições abaixo.')
    add_heading(doc,'2. Objeto')
    add_para(doc,'O presente contrato tem por objeto a concessão de licença de uso da plataforma PONTO CERTO para gestão de jornada, controle eletrônico de ponto, acompanhamento operacional, tratamento administrativo das marcações, geração de relatórios, utilização dos aplicativos e demais recursos efetivamente contratados.')
    add_para(doc,'A licença é concedida para uso interno da CONTRATANTE, dentro dos limites de funcionários, filiais e recursos definidos neste instrumento e na proposta comercial de origem.')
    add_heading(doc,'3. Condições comerciais e limites')
    add_info_table(doc,[('Plano contratado','{{plano_nome}}'),('Mensalidade','{{valor_mensal}}'),('Implantação','{{valor_implantacao}}'),('Limite de funcionários','{{limite_funcionarios}}'),('Limite de filiais','{{limite_filiais}}'),('Início de vigência','{{inicio_vigencia}}'),('Prazo contratual','{{prazo_contratual}}'),('Dia de vencimento','{{dia_vencimento}}'),('Forma de pagamento','{{forma_pagamento}}'),('Regra de reajuste','{{regra_reajuste}}')])

    # PAGE 2
    add_page_break(doc)
    add_heading(doc,'4. Funcionalidades e serviços contratados')
    add_para(doc,'Integram o escopo deste contrato as funcionalidades-base da plataforma e os módulos adicionais efetivamente liberados para a CONTRATANTE. A descrição abaixo passa a compor o escopo contratual desta contratação:')
    add_para(doc,'{{funcionalidades_contratadas}}')
    add_heading(doc,'5. Recursos não contratados ou não liberados')
    add_para(doc,'Os seguintes recursos adicionais permanecem fora do escopo desta contratação, salvo aditivo ou liberação comercial formal posterior: {{recursos_nao_contratados}}.')
    add_para(doc,'A ausência de determinado recurso não impede o funcionamento das funcionalidades-base expressamente descritas neste contrato. Recursos opcionais poderão ser habilitados futuramente mediante alteração contratual ou concessão comercial registrada no ambiente SaaS.')

    # PAGE 3
    add_page_break(doc)
    add_heading(doc,'6. Implantação e parametrização')
    add_para(doc,'A implantação compreenderá as atividades previstas na proposta comercial e poderá incluir cadastro inicial da empresa, parâmetros de jornada, locais de trabalho, regras de marcação, importação inicial de colaboradores, orientação aos responsáveis e validação dos recursos contratados.')
    add_bullets(doc,[
        'Configuração de jornadas, intervalos, tolerâncias, escalas e regras operacionais;',
        'Configuração de locais de trabalho, geolocalização e raio de marcação, quando aplicável;',
        'Orientação de uso do aplicativo Android e do PWA para iPhone/iOS, quando contratados;',
        'Validação do modo offline, sincronização, selfie e vínculo de dispositivo, quando aplicáveis;',
        'Configuração de alertas e destinatários do WhatsApp, quando contratado;',
        'Validação do layout padrão de exportação para folha/ERP, quando contratado.'
    ])
    add_heading(doc,'7. Suporte, disponibilidade e manutenção')
    add_para(doc,'A CONTRATADA disponibilizará suporte operacional aos usuários administrativos da CONTRATANTE e realizará atualizações corretivas e evolutivas compatíveis com a continuidade do produto.')
    add_para(doc,'Poderão ocorrer manutenções programadas, indisponibilidades decorrentes de provedores de internet, serviços de mensageria, lojas de aplicativos, dispositivos, infraestrutura de terceiros ou eventos fora do controle razoável da CONTRATADA. Sempre que tecnicamente possível, a CONTRATADA adotará medidas para reduzir o impacto dessas ocorrências.')
    add_heading(doc,'8. Segurança, confidencialidade e proteção de dados pessoais')
    add_para(doc,'A CONTRATADA manterá controles de autenticação, segregação de acesso, permissões administrativas, logs técnicos e trilhas de auditoria compatíveis com a arquitetura da plataforma. Credenciais, tokens, chaves, senhas e demais segredos técnicos não deverão ser expostos em telas, relatórios ou auditorias de usuários.')
    add_para(doc,'As partes comprometem-se a tratar como confidenciais as informações não públicas a que tiverem acesso em razão deste contrato, utilizando-as exclusivamente para as finalidades relacionadas à prestação e utilização da plataforma.')
    add_heading(doc,'9. LGPD - tratamento de dados pessoais')
    add_para(doc,'No tratamento de dados pessoais relacionado à utilização da plataforma, as partes deverão observar a Lei nº 13.709/2018 (LGPD), respeitando as finalidades da operação, os perfis de acesso configurados e as responsabilidades de cada parte.')
    add_bullets(doc,[
        'A CONTRATANTE é responsável pela legitimidade dos dados cadastrados, pela definição dos usuários autorizados e pelas instruções de tratamento necessárias à sua operação;',
        'A CONTRATADA tratará os dados necessários à disponibilização, segurança, suporte, armazenamento, processamento e funcionamento dos recursos contratados;',
        'O acesso administrativo deverá observar o princípio de necessidade, com utilização de perfis e permissões compatíveis com as atribuições dos usuários;',
        'Dados sensíveis de autenticação, segredos técnicos e imagens biométricas brutas não deverão ser persistidos em trilhas de auditoria;',
        'Incidentes de segurança relevantes deverão ser tratados conforme a natureza do evento, as responsabilidades envolvidas e a legislação aplicável.'
    ],8.8)

    # PAGE 4
    add_page_break(doc)
    add_heading(doc,'10. Obrigações da CONTRATADA')
    add_bullets(doc,[
        'Disponibilizar a plataforma e os recursos contratados dentro dos limites comerciais estabelecidos;',
        'Manter controles razoáveis de segurança, autenticação, segregação de usuários e proteção de credenciais;',
        'Executar atualizações necessárias à manutenção e evolução do produto;',
        'Manter os documentos e revisões comerciais gerados pelo sistema conforme a política da plataforma;',
        'Prestar suporte nos canais e condições operacionais disponibilizados comercialmente;',
        'Preservar a segregação dos dados entre clientes no ambiente multiempresa.'
    ])
    add_heading(doc,'11. Obrigações da CONTRATANTE')
    add_bullets(doc,[
        'Fornecer informações corretas para cadastro, implantação e parametrização;',
        'Manter atualizados os usuários, perfis, jornadas, locais e demais parâmetros sob sua responsabilidade;',
        'Zelar pela guarda das credenciais e impedir o compartilhamento indevido de acessos administrativos;',
        'Disponibilizar internet, dispositivos e permissões de câmera/localização necessárias aos recursos utilizados;',
        'Utilizar a plataforma de acordo com a legislação trabalhista, regras internas e políticas aplicáveis à sua operação;',
        'Comunicar ocorrências técnicas relevantes e colaborar com as informações necessárias ao atendimento.'
    ])
    add_heading(doc,'12. Valores, faturamento e reajuste')
    add_para(doc,'A CONTRATANTE pagará à CONTRATADA a mensalidade de {{valor_mensal}}, observando o vencimento no dia {{dia_vencimento}} e a forma de pagamento {{forma_pagamento}}. O valor de implantação é de {{valor_implantacao}}, conforme condições da proposta {{numero_proposta}}.')
    add_para(doc,'O reajuste observará a seguinte regra: {{regra_reajuste}}. Alterações de plano, quantidade contratada de funcionários, filiais ou recursos dependerão de ajuste comercial registrado entre as partes.')
    add_heading(doc,'13. Vigência, renovação e rescisão')
    add_para(doc,'Este contrato entra em vigor em {{inicio_vigencia}} e permanecerá válido pelo prazo de {{prazo_contratual}}. A continuidade após o prazo inicial, as condições de renovação e eventual rescisão deverão observar as condições comerciais aplicáveis e as obrigações pendentes entre as partes.')
    add_heading(doc,'14. Conformidade do registro eletrônico de ponto')
    add_para(doc,'A solução comercializada é apresentada com enquadramento funcional compatível com REP-P, conforme descrito na proposta de origem, devendo a utilização observar os requisitos formais e técnicos aplicáveis, inclusive aqueles relacionados à Portaria MTP nº 671/2021 e às demais normas indicadas na proposta comercial.')
    add_para(doc,'A CONTRATANTE declara ciência de que a utilização da plataforma em conformidade depende também da correta parametrização, manutenção dos requisitos formais aplicáveis e uso adequado dos recursos disponibilizados.')

    # FINAL CLAUSES - continue naturally to use the available page area
    add_heading(doc,'15. Confidencialidade, propriedade intelectual e uso da plataforma')
    add_para(doc,'A licença concedida não transfere à CONTRATANTE qualquer direito de propriedade intelectual sobre o software, códigos, marcas, componentes, integrações, documentação técnica ou demais elementos da plataforma PONTO CERTO.')
    add_para(doc,'A CONTRATANTE não deverá reproduzir, desmontar, sublicenciar, comercializar ou disponibilizar a terceiros a plataforma fora das hipóteses permitidas neste contrato, ressalvados os acessos de seus usuários autorizados.')
    add_heading(doc,'16. Responsabilidades e limitações operacionais')
    add_para(doc,'Cada parte responderá pelas obrigações que estiverem sob sua gestão. A CONTRATANTE responde pela veracidade das informações fornecidas, pela gestão de seus usuários, pela infraestrutura mínima e pelas decisões administrativas decorrentes dos relatórios e informações produzidos pelo sistema.')
    add_para(doc,'Integrações dependentes de documentação técnica de terceiros, APIs externas, serviços de mensageria, sistemas de folha ou ERPs poderão sofrer alterações ou indisponibilidades alheias ao controle da CONTRATADA.')
    add_heading(doc,'17. Foro')
    add_para(doc,'Fica definido o foro de {{foro}} para dirimir controvérsias relacionadas a este contrato, observadas as condições legais aplicáveis.')
    add_heading(doc,'18. Observações adicionais')
    add_para(doc,'{{observacoes}}')
    add_heading(doc,'19. Declaração de aceite')
    add_para(doc,'As partes declaram que leram e compreenderam as condições comerciais e operacionais deste instrumento, inclusive o escopo de funcionalidades contratadas, limites de usuários/filiais, valores, condições de implantação e responsabilidades descritas acima.')
    add_heading(doc,'20. Documentos, revisões e integridade')
    add_para(doc,'As propostas e contratos gerados pela plataforma poderão possuir revisões sucessivas. Cada documento emitido poderá ser armazenado com identificação de revisão, data de geração, usuário responsável, nome do arquivo e hash SHA-256, permitindo verificação de integridade e preservação do histórico comercial.')
    add_para(doc,'A geração de uma nova revisão não elimina automaticamente os documentos anteriores já armazenados, os quais poderão permanecer disponíveis conforme as regras administrativas e de retenção aplicáveis ao ambiente SaaS.')
    add_heading(doc,'21. Contrato assinado e comprovação documental')
    add_para(doc,'Após a formalização, a CONTRATADA poderá armazenar no ambiente comercial cópia em PDF do instrumento assinado. O arquivo assinado deverá ser associado ao respectivo contrato para fins de organização documental e rastreabilidade administrativa.')
    add_para(doc,'Eventual utilização futura de plataforma externa de assinatura eletrônica dependerá de integração específica e não altera, por si só, as condições comerciais deste instrumento.')
    add_heading(doc,'22. Disposições gerais')
    add_bullets(doc,[
        'Alterações de plano, preço, limites ou recursos deverão ser formalizadas por meio comercial apropriado e não modificarão retroativamente documentos históricos;',
        'A eventual tolerância de uma parte quanto ao descumprimento de obrigação específica não implicará renúncia automática aos demais direitos previstos neste instrumento;',
        'Se alguma disposição vier a ser considerada inaplicável, as demais condições permanecerão válidas na extensão permitida;',
        'A proposta comercial de origem complementa este contrato quanto ao detalhamento do produto e das condições negociadas, prevalecendo este instrumento em caso de conflito contratual expressamente identificado.'
    ],8.8)
    add_para(doc,'Este modelo comercial deve ser submetido à revisão jurídica antes da utilização definitiva.',italic=True)

    # SIGNATURE PAGE - separate section with bottom alignment
    sec=doc.add_section(WD_SECTION.NEW_PAGE)
    sec.top_margin=Cm(1.25); sec.bottom_margin=Cm(1.3); sec.left_margin=Cm(1.45); sec.right_margin=Cm(1.45); sec.header_distance=Cm(.45); sec.footer_distance=Cm(.45)
    set_vertical_align_bottom(sec)
    # unlink to preserve header/footer inherited visually while allowing final section mechanics
    sec.header.is_linked_to_previous=True; sec.footer.is_linked_to_previous=True
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before=Pt(430)
    r=p.add_run('ASSINATURAS'); r.bold=True; r.font.size=Pt(14); r.font.color.rgb=NAVY
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('Por estarem de acordo, as partes firmam o presente instrumento.'); r.font.size=Pt(9.5); r.font.color.rgb=GRAY
    t=doc.add_table(rows=2,cols=2); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    for i,w in enumerate((8.3,8.3)): t.columns[i].width=Cm(w)
    for i,label in enumerate(('CONTRATANTE','CONTRATADA')):
        c=t.rows[0].cells[i]; set_cell_shading(c,NAVY_HEX); set_cell_border(c)
        p=c.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run(label); r.bold=True; r.font.color.rgb=WHITE; r.font.size=Pt(9)
    vals=(
        '________________________________________\n{{representante_cliente}}\n{{empresa_nome}}\nCNPJ: {{empresa_cnpj}}',
        '________________________________________\n{{representante_ponto_certo}}\nPONTO CERTO\nCNPJ: 67.609.840/0001-27'
    )
    for i,val in enumerate(vals):
        c=t.rows[1].cells[i]; set_cell_border(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.BOTTOM
        p=c.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run(val); r.font.size=Pt(9)
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('Data: {{data_contrato}}'); r.bold=True; r.font.size=Pt(9.5)
    doc.save(OUT/'contrato-ponto-certo.docx')

if __name__=='__main__':
    build_proposal(); build_contract(); print('Templates comerciais completos gerados em',OUT)
