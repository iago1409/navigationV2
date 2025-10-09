# Checklist de QA de Campo — AgriHub GPS

Este documento contém cenários e critérios objetivos para validação do app em campo.

---

## 📱 Nativo (Expo Go / iOS / Android)

### Permissões e Localização
- [ ] Permissão de localização solicitada e concedida
- [ ] Posição atual exibida (ponto azul) sem travamentos
- [ ] GPS status exibido corretamente no header (Aguardando / Ativo / Negado)

### Semáforo de Precisão
- [ ] Semáforo de precisão muda de cor conforme o sinal GPS
- [ ] Verde: precisão ≤ 10m (alta)
- [ ] Amarelo: precisão 10-25m (média)
- [ ] Vermelho: precisão > 25m (baixa)
- [ ] Cinza: precisão indisponível
- [ ] Tooltip exibe informação clara ao tocar

### Mapa e Layout
- [ ] Mapa **sem sobreposição** de cards ou banners
- [ ] FABs **Center** e **Fit** visíveis e funcionais no canto superior direito
- [ ] Zona do mapa ocupa ~56% da altura (mínimo 320px)
- [ ] Painel inferior rolável sem bloquear o mapa
- [ ] Pan e zoom no mapa funcionam sem travamentos

### Navegação Ponto a Ponto
- [ ] Navegação **um ponto por vez** (somente destino atual renderizado)
- [ ] Marcador vermelho no ponto de destino
- [ ] Círculo de 20m ao redor do destino
- [ ] Linha azul conectando posição atual ao destino
- [ ] Ponto atual exibido como "X de N" no header

### Cálculos e Métricas
- [ ] Distância (Haversine) atualiza ao caminhar
- [ ] Distância formatada corretamente (m < 1000, km ≥ 1000)
- [ ] Coordenadas do destino com **8 casas decimais**
- [ ] Coordenadas atuais no footer com **8 casas decimais**

### Bússola Direcional
- [ ] Bússola exibe dial circular com marcas de grau (0, 30, 60...)
- [ ] Cardeais N/E/S/W visíveis (N destacado)
- [ ] Ponteiro **verde** quando alinhado (≤10°)
- [ ] Ponteiro **amarelo** quando ajuste leve necessário (10-45°)
- [ ] Ponteiro **vermelho** quando fora de rota (>45°)
- [ ] Ponteiro **cinza** quando aguardando bússola
- [ ] Ring/halo luminoso com cor correspondente ao estado
- [ ] Mensagem intuitiva abaixo do dial:
  - "🟢 Na direção certa"
  - "🟡 Ajuste pequeno"
  - "🔴 Vire na direção do ponto"
  - "⚪ Aguardando bússola"
- [ ] Rotação do ponteiro suave e responsiva ao girar o celular
- [ ] Nenhum valor numérico técnico visível (heading/bearing/delta ocultos)

### Chegada ao Ponto
- [ ] Toast aparece ao entrar no raio de 20m
- [ ] Haptics de sucesso ao entrar no raio (mobile only)
- [ ] Mensagem: "Ponto alcançado! Você está dentro do raio."
- [ ] **Sem auto-avanço** (usuário controla quando avançar)
- [ ] Botão "Próximo Ponto" fica verde destacado quando inside=true

### Confirmação de Coleta
- [ ] Modal aparece ao tocar "Próximo Ponto"
- [ ] Modal pergunta: "Você concluiu a coleta no Ponto X?"
- [ ] Botão "Cancelar" fecha modal e mantém no ponto atual
- [ ] Botão "Confirmar" registra coleta, vibra, mostra toast e avança
- [ ] Toast: "Ponto X registrado como coletado."
- [ ] Badge "Coletados: X / N" atualiza corretamente no header

### Controles de Navegação
- [ ] Botão **Próximo Ponto** sempre disponível (não bloqueado por raio)
- [ ] Botão **Próximo Ponto** destacado (verde) quando dentro do raio
- [ ] Botão **Voltar Ponto** funcional (exceto no primeiro ponto)
- [ ] Botões desabilitados visualmente quando não aplicáveis
- [ ] Áreas de toque ≥ 48pt em todos os botões

### Zerar Rota
- [ ] Botão **Zerar** solicita confirmação
- [ ] Confirmar limpa estado (índice, coletas, posições)
- [ ] App volta ao estado inicial corretamente
- [ ] Nenhum dado de coleta permanece após zerar

### Performance e Estabilidade
- [ ] Performance fluida (sem engasgos ao navegar)
- [ ] Sem warnings críticos no console
- [ ] Transições suaves (ponteiro, cores, animações)
- [ ] Subscriptions de GPS canceladas ao sair da tela
- [ ] Subscriptions de heading canceladas ao sair da tela
- [ ] Sem memory leaks visíveis
- [ ] App não trava ao alternar entre telas

---

## 🌐 Web (Navegador)

### Layout e Placeholder
- [ ] Placeholder do mapa visível com altura correta
- [ ] Texto explicativo: "Mapa nativo indisponível no Web. Use o app móvel."
- [ ] Layout consistente (header → zona mapa → painel inferior)
- [ ] Painel inferior rolável funciona corretamente

### Funcionalidades Adaptadas
- [ ] Semáforo de precisão oculto ou cinza
- [ ] Tooltip "Indisponível no navegador" ao interagir com semáforo (se visível)
- [ ] Bússola estática com aviso "Indisponível no navegador"
- [ ] Sem tentativa de acesso a APIs nativas (location, heading)

### Console e Erros
- [ ] Sem erros no console ao navegar entre telas
- [ ] Sem warnings sobre APIs não disponíveis
- [ ] Navegação entre index e navigate funciona

---

## 🎨 UX/Conteúdo

### Visual e Design
- [ ] Dark mode consistente (#0E0E0E background, #141414 cards)
- [ ] Contraste adequado (texto branco #FFFFFF sobre fundos escuros)
- [ ] Tipografia legível (11-18px conforme hierarquia)
- [ ] Espaçamentos múltiplos de 8 (8px, 12px, 16px, 24px)
- [ ] Border radius consistente (8-10px)

### Organização de Cards
- [ ] Cards enxutos e organizados
- [ ] Nada cobre o mapa (sem overlays)
- [ ] Progresso, Bússola, Controles em ordem lógica
- [ ] Footer discreto com coords atuais

### Mensagens e Feedback
- [ ] Mensagens curtas e claras
- [ ] "Obtendo localização…" ao iniciar
- [ ] "Aguardando localização precisa…" durante baixa precisão
- [ ] "Ponto alcançado! Você está dentro do raio." ao chegar
- [ ] "Ponto X registrado como coletado." após confirmação
- [ ] "Rota concluída!" ao terminar todos os pontos
- [ ] Sem jargões técnicos visíveis ao usuário final

### Coordenadas e Formatação
- [ ] Coordenadas com **8 casas decimais** onde especificado
- [ ] Distância formatada (m ou km) corretamente
- [ ] Números monospace para melhor leitura
- [ ] Valores "—" quando dados indisponíveis

### Acessibilidade
- [ ] Ícones legíveis e com contraste adequado
- [ ] Áreas de toque ≥ 44pt em todos os botões
- [ ] Labels descritivos (acessibilidade)
- [ ] Cores com significado reforçado por texto/emojis

---

## ✅ Critérios de Aprovação

### Mínimo Aceitável
- ✅ **TODOS** os itens da seção "Nativo" marcados
- ✅ **TODOS** os itens da seção "Web" marcados
- ✅ **TODOS** os itens da seção "UX/Conteúdo" marcados
- ✅ Nenhum bug bloqueante encontrado
- ✅ Performance aceitável em dispositivos de teste

### Observações
- Teste em pelo menos 2 dispositivos diferentes (iOS + Android ou 2 Androids)
- Teste em ambiente real (caminhar 50-100m com GPS ativo)
- Teste cenário completo (carregar CSV → navegar → coletar → concluir)
- Documentar qualquer comportamento inesperado mesmo se não bloqueante

---

**Data do último teste:** __________
**Testador:** __________
**Dispositivos:** __________
**Status:** ☐ Aprovado | ☐ Reprovado | ☐ Parcial
