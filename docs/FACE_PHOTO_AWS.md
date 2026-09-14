# Foto opcional do funcionário e AWS Rekognition

No painel da empresa: Funcionários → Editar → Foto para validação facial.
Salve primeiro um funcionário novo. Use “Tirar foto” no celular (a câmera depende do navegador), ou “Selecionar imagem” no computador. Confira a prévia e clique em “Salvar foto”. A foto é salva separadamente do restante do cadastro. É possível substituir ou remover a foto.

Sem foto na tabela `employee_face_images`, o fluxo atual de ponto permanece. Com foto, a API compara a selfie com a referência do funcionário autenticado usando AWS `CompareFaces`, após verificar que a selfie contém um único rosto. GPS, jornada, aparelho e biometria continuam seguindo suas regras atuais. A dispensa de biometria do aparelho não dispensa esta comparação quando há foto cadastrada.

O ponto remoto/offline é comparado no servidor na sincronização, usando a referência vigente naquele momento. Uma divergência ou indisponibilidade da AWS não gera ponto. A fila do aparelho mantém a tentativa para tratamento. A rota antiga sem selfie recusa funcionários com foto. Ajustes manuais autorizados pelo RH continuam disponíveis como ajustes administrativos.

As imagens de referência ficam no banco, não em pasta pública. Apenas administrador da empresa e RH podem consultar e alterar. O resultado fica nas evidências do ponto. Remover a referência apaga essa imagem; evidências históricas do ponto permanecem. As coleções e cadastros do mecanismo antigo não são utilizados nem reativados; recadastre a foto nesta tela para ativar a nova regra.

## Servidor

Edite `apps/api/.env`, preservando as demais configurações:

```env
FACE_PROVIDER=AWS_REKOGNITION
FACE_MAX_IMAGE_MB=5
FACE_MATCH_THRESHOLD=95
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SUA_SECRET_ACCESS_KEY
```

Use a região habilitada na sua conta. O SDK também aceita IAM Role e `AWS_SESSION_TOKEN` quando necessário. Não coloque as chaves em variáveis `VITE_`/`EXPO_PUBLIC_`, no Git ou no navegador. Se usar chaves do `.env`, confira se o PM2 não contém valores antigos dessas variáveis.

A identidade IAM precisa somente destas ações para este recurso:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["rekognition:DetectFaces", "rekognition:CompareFaces"],
    "Resource": "*"
  }]
}
```

Na raiz do repositório do servidor:

```bash
git pull --ff-only origin main
bash scripts/deploy-server.sh
```

O deploy instala o SDK, compila API/painel/PWA, aplica `019_optional_employee_face.sql` e reinicia a API. O banco precisa aceitar pacotes maiores que a foto enviada (`max_allowed_packet` de pelo menos 8 MB para fotos de 5 MB). Faça backup do banco antes de aplicar migrações conforme sua rotina operacional.

## Verificação depois do deploy

1. Entre como RH, cadastre uma foto frontal com a ciência do funcionário e confirme a prévia.
2. Registre um ponto com a mesma pessoa, respeitando as demais regras da empresa.
3. Confirme que uma foto de outra pessoa não gera ponto.
4. Substitua a referência, remova-a e confirme o retorno ao fluxo sem comparação.
5. Teste também a sincronização de uma tentativa remota se essa modalidade estiver habilitada.

A comparação facial é probabilística e não equivale a detecção de vivacidade. Não foi implementado AWS Face Liveness. O limiar padrão é 95; uma recusa deve permitir orientação pelo RH. A execução real com a conta AWS precisa ser validada no servidor; os testes automatizados simulam as respostas do serviço.

Referências oficiais: [CompareFaces](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_CompareFaces.html) e [DetectFaces](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_DetectFaces.html).
