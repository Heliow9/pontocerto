"""Create the reusable template from the approved source, preserving OOXML styling."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
import sys

source=Path(sys.argv[1]); target=Path(sys.argv[2])
ns={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
def replace_in_paragraph(p,old,new):
    nodes=p.findall('.//w:t',ns)
    full=''.join(n.text or '' for n in nodes)
    while old in full:
        start=full.index(old); end=start+len(old); offset=0
        first=True
        for n in nodes:
            text=n.text or ''; stop=offset+len(text)
            if stop>start and offset<end:
                prefix=text[:max(0,start-offset)]
                suffix=text[max(0,end-offset):] if stop>end else ''
                n.text=prefix+(new if first else '')+suffix
                n.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
                first=False
            offset=stop
        full=''.join(n.text or '' for n in nodes)
target.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(source) as src, ZipFile(target,'w',ZIP_DEFLATED) as out:
    for item in src.infolist():
        data=src.read(item.filename)
        if item.filename.startswith('word/') and item.filename.endswith('.xml'):
            root=etree.fromstring(data)
            for p in root.findall('.//w:p',ns):
                replacements={
                    'REALENERGY LTDA':'{{empresa_nome}}',
                    '41.116.138/0001-38':'{{empresa_cnpj}}',
                    '12 de setembro de 2026':'{{data_proposta}}',
                    'Validade da proposta: 15 dias':'Validade da proposta: {{data_validade}}',
                    'Plano Corporativo':'Plano {{plano_nome}}',
                    'Até 150 colaboradores':'Até {{limite_funcionarios}} colaboradores',
                    'R$ 299,90 / mês':'{{valor_mensal}} / mês',
                    'R$ 250,00':'{{valor_implantacao}}',
                }
                for old,new in replacements.items():replace_in_paragraph(p,old,new)
                text=''.join(p.xpath('.//w:t/text()',namespaces=ns))
                if text.startswith('Condição de pagamento:'):
                    parent=p.getparent(); index=parent.index(p)+1
                    for line in ['Responsável: {{responsavel}} | {{email}} | {{telefone}}',
                                 'Recursos contratados: {{recursos}}. Filiais adicionais: {{limite_filiais}}.',
                                 'Prazo de implantação: {{prazo_implantacao}} dias. {{observacoes}}',
                                 'As funcionalidades descritas neste documento integram o catálogo do produto. A contratação contempla somente os recursos indicados acima.']:
                        paragraph=etree.Element('{'+ns['w']+'}p')
                        props=p.find('w:pPr',ns)
                        if props is not None:
                            from copy import deepcopy
                            paragraph.append(deepcopy(props))
                        run=etree.SubElement(paragraph,'{'+ns['w']+'}r')
                        etree.SubElement(run,'{'+ns['w']+'}t').text=line
                        parent.insert(index,paragraph);index+=1
            data=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        if item.filename=='docProps/core.xml':
            data=data.replace(b'REALENERGY',b'Ponto Certo')
        out.writestr(item,data)
print(str(target))
