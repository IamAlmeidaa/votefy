# Onda — execução local

Esta versão é um projeto React/TanStack Start porque essa é a estrutura exigida pelo Lovable. Não é uma entrega em três arquivos HTML/CSS/JavaScript puros, e a extensão Live Server não executa este projeto.

## Executar no Visual Studio Code
1. Exporte o código do projeto pelo Lovable e abra a pasta no Visual Studio Code.
2. Instale Bun (https://bun.sh) no computador.
3. Abra o terminal integrado e execute `bun install`.
4. Execute `bun run dev` e abra o endereço informado no terminal.

## Dados locais
Importe seus arquivos pelo botão Adicionar músicas ou arraste-os para a janela. Os arquivos e capas ficam no IndexedDB deste navegador. Playlists, favoritos, salas e preferências ficam no armazenamento local. Limpar dados do site remove a coleção. Outro navegador ou endereço não terá a mesma biblioteca. Formatos e codecs dependem do suporte do navegador.

As salas não conectam pessoas pela internet: os participantes são fictícios e a troca do participante ativo simula os votos. O administrador controla a rodada. Sem votos ou em empate a escolha é aleatória; com menos de quatro músicas restantes a rodada usa todas elas.

Após a página e os recursos necessários terem sido carregados, a reprodução dos arquivos importados funciona sem conexão. Não há instalação offline nem garantia de reabrir/recarregar o site sem conexão nesta versão.

As imagens de capa sem metadados são ilustrações, não álbuns ou músicas de um serviço de streaming. Nenhuma faixa fictícia é adicionada à biblioteca.