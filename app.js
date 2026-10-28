import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, push, onValue, remove, update, set
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

/*
 * DICALO 2.0
 * Mantém a mesma configuração Firebase e os caminhos existentes:
 * duos/diana-goncalo/messages e duos/diana-goncalo/shopping.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCAalkXPWqX1JkXpzHBSmyRigXCd7PCpKc",
  authDomain: "dicalo-c5a8d.firebaseapp.com",
  projectId: "dicalo-c5a8d",
  storageBucket: "dicalo-c5a8d.firebasestorage.app",
  messagingSenderId: "762312604990",
  appId: "1:762312604990:web:4338a94799c5e50dea406f",
  databaseURL: "https://dicalo-c5a8d-default-rtdb.europe-west1.firebasedatabase.app"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const ROOT = "duos/diana-goncalo";
const paths = {
  messages: `${ROOT}/messages`,
  shopping: `${ROOT}/shopping`,
  tasks: `${ROOT}/tasks`,
  expenses: `${ROOT}/expenses`,
  ideas: `${ROOT}/ideas`
};
let currentUser = null;
let creatingAccount = false;
let activeView = "home";
let stopDataListener = null;
let currentItems = {};
let currentMessages = {};
let currentTasks = {};
let currentExpenses = {};
let currentIdeas = {};
let galleryItems = [];
let selectedPhotoUrl = null;

const dailyMessages = [
  "Os pequenos planos também contam.",
  "A vida flui melhor quando partilhamos o caminho.",
  "Um dia de cada vez, juntos nos vossos planos.",
  "As melhores memórias começam com coisas simples.",
  "Há sempre espaço para mais uma ideia.",
  "O melhor plano pode ser aquele que ainda não fizeram."
];
let messageIndex = new Date().getDate() % dailyMessages.length;

function setScreen(name) {
  $("#loading-screen")?.classList.toggle("hidden", name !== "loading");
  $("#auth-screen")?.classList.toggle("hidden", name !== "auth");
  $("#app-screen")?.classList.toggle("hidden", name !== "app");
}
function authMessage(text = "", type = "") {
  const el = $("#auth-message");
  if (!el) return;
  el.textContent = text;
  el.className = `feedback ${type}`.trim();
}
function toast(message) {
  const region = $("#toast-region");
  if (!region) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  region.append(el);
  window.setTimeout(() => el.remove(), 3200);
}
function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já tem uma conta.",
    "auth/invalid-email": "O endereço de e-mail não é válido.",
    "auth/invalid-credential": "E-mail ou palavra-passe incorretos.",
    "auth/weak-password": "A palavra-passe deve ter pelo menos 6 caracteres.",
    "auth/operation-not-allowed": "Ativa E-mail/Palavra-passe na Firebase Authentication.",
    "auth/network-request-failed": "Não foi possível ligar à Internet.",
    "auth/too-many-requests": "Demasiadas tentativas. Tenta mais tarde."
  };
  return messages[error.code] || "Ocorreu um erro. Confirma a ligação e tenta novamente.";
}
function safeText(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text ?? "";
  if (className) el.className = className;
  return el;
}
function formatDate(value, includeTime = false) {
  if (!Number.isFinite(Number(value))) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(new Date(Number(value)));
}
function formatMoney(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}
function setFeedback(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = `feedback ${type}`.trim();
}
function makeButton(text, className = "button button-primary", onClick = null) {
  const button = safeText("button", text, className);
  button.type = "button";
  if (onClick) button.addEventListener("click", onClick);
  return button;
}
function makeField({ placeholder = "", type = "text", required = false, maxLength = 160, min = undefined, step = undefined } = {}) {
  const input = document.createElement("input");
  input.className = "field";
  input.type = type;
  input.placeholder = placeholder;
  input.required = required;
  input.maxLength = maxLength;
  if (min !== undefined) input.min = String(min);
  if (step !== undefined) input.step = String(step);
  return input;
}
function makePanel(title) {
  const panel = document.createElement("section");
  panel.className = "panel";
  if (title) panel.append(safeText("h3", title));
  return panel;
}
function makeHeader(kicker, title, description) {
  const header = document.createElement("header");
  header.className = "view-heading";
  header.append(safeText("p", kicker, "eyebrow"), safeText("h1", title));
  if (description) header.append(safeText("p", description));
  return header;
}
function makeEmpty(icon, title, description) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.append(safeText("span", icon, "empty-icon"), safeText("strong", title));
  if (description) el.append(safeText("p", description));
  return el;
}
function addDeleteButton(parent, label, onDelete) {
  const btn = makeButton("Apagar", "delete-button", async () => {
    if (!confirm(`Queres apagar ${label}?`)) return;
    btn.disabled = true;
    try { await onDelete(); toast("Removido."); }
    catch (e) { console.error(e); toast("Não foi possível apagar."); btn.disabled = false; }
  });
  parent.append(btn);
}
function subscribe(path, callback) {
  return onValue(ref(db, path), snapshot => callback(snapshot.val() || {}), error => {
    console.error(`Erro em ${path}`, error);
    toast("Não foi possível sincronizar. Confirma as regras da Firebase.");
  });
}
function updateHomeStats() {
  const openTasks = Object.values(currentTasks).filter(x => x && x.done !== true).length;
  const openShopping = Object.values(currentItems).filter(x => x && x.done !== true).length;
  const total = Object.values(currentExpenses).reduce((sum, x) => sum + (Number(x?.amount) || 0), 0);
  $("#home-task-count").textContent = String(openTasks);
  $("#home-shopping-count").textContent = String(openShopping);
  $("#home-expense-total").textContent = formatMoney(total);
}
function startSharedListeners() {
  stopSharedListeners();
  const stops = [
    subscribe(paths.shopping, data => { currentItems = data; updateHomeStats(); if (activeView === "shopping") renderShopping(); }),
    subscribe(paths.tasks, data => { currentTasks = data; updateHomeStats(); if (activeView === "tasks") renderTasks(); }),
    subscribe(paths.expenses, data => { currentExpenses = data; updateHomeStats(); if (activeView === "finance") renderFinance(); }),
    subscribe(paths.ideas, data => { currentIdeas = data; if (activeView === "tasks") renderTasks(); })
  ];
  stopDataListener = () => stops.forEach(stop => stop());
}
function stopSharedListeners() {
  if (stopDataListener) stopDataListener();
  stopDataListener = null;
}
function updateDailyMessage() {
  const el = $("#daily-message");
  if (el) el.textContent = dailyMessages[messageIndex];
}
$("#change-message")?.addEventListener("click", () => {
  messageIndex = (messageIndex + 1) % dailyMessages.length;
  updateDailyMessage();
});
$("#toggle-auth")?.addEventListener("click", () => {
  creatingAccount = !creatingAccount;
  $("#auth-submit").textContent = creatingAccount ? "Criar conta" : "Entrar";
  $("#toggle-auth").textContent = creatingAccount ? "Já tens conta? Entrar" : "Ainda não tens conta? Criar conta";
  $("#auth-title").textContent = creatingAccount ? "Criar o vosso espaço" : "Entrar no vosso espaço";
  $("#auth-description").textContent = creatingAccount ? "Criem a vossa conta para começar." : "Um só espaço para tudo o que partilham.";
  $("#auth-password").autocomplete = creatingAccount ? "new-password" : "current-password";
  authMessage();
});
$("#auth-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || !password) return authMessage("Preenche o e-mail e a palavra-passe.", "error");
  if (creatingAccount && password.length < 6) return authMessage("A palavra-passe deve ter pelo menos 6 caracteres.", "error");
  const submit = $("#auth-submit");
  submit.disabled = true;
  submit.textContent = creatingAccount ? "A criar conta..." : "A entrar...";
  try {
    if (creatingAccount) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    authMessage(friendlyError(error), "error");
  } finally {
    submit.disabled = false;
    submit.textContent = creatingAccount ? "Criar conta" : "Entrar";
  }
});
$("#forgot-password")?.addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  if (!email) { authMessage("Escreve o teu e-mail primeiro.", "error"); $("#auth-email").focus(); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    authMessage("Se existir uma conta associada, receberás instruções por e-mail.", "success");
  } catch (error) { authMessage(friendlyError(error), "error"); }
});
$("#logout-button")?.addEventListener("click", async () => {
  try { stopSharedListeners(); await signOut(auth); }
  catch (error) { console.error(error); toast("Não foi possível terminar a sessão."); }
});

function setActiveNav(view) {
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.nav === view || (view === "finance" && button.dataset.nav === "tasks" && false)));
}
function openView(view) {
  activeView = view;
  const home = $("#home-view");
  const feature = $("#feature-view");
  if (view === "home") {
    home.classList.remove("hidden");
    feature.classList.add("hidden");
  } else {
    home.classList.add("hidden");
    feature.classList.remove("hidden");
    const content = $("#feature-content");
    content.replaceChildren();
    if (view === "shopping") renderShopping();
    else if (view === "finance") renderFinance();
    else if (view === "gallery") renderGallery();
    else if (view === "tasks") renderTasks();
    else if (view === "notes") renderMessages();
    else if (view === "games") renderGames();
    else { activeView = "home"; home.classList.remove("hidden"); feature.classList.add("hidden"); }
  }
  setActiveNav(activeView);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-view]").forEach(button => button.addEventListener("click", () => openView(button.dataset.view)));
$$("[data-nav]").forEach(button => button.addEventListener("click", () => openView(button.dataset.nav)));
$("#back-home")?.addEventListener("click", () => openView("home"));

function renderShopping() {
  const root = $("#feature-content");
  root.replaceChildren(makeHeader("ORGANIZAR · CASA", "Lista de compras", "Adicionem o que falta e assinalem o que já está no carrinho."));
  const panel = makePanel("Adicionar à lista");
  const form = document.createElement("form");
  form.className = "form-row";
  const input = makeField({ placeholder: "Ex.: leite, pão, fruta...", required: true, maxLength: 100 });
  const submit = makeButton("＋ Adicionar");
  submit.type = "submit";
  form.append(input, submit);
  const feedback = safeText("p", "", "feedback");
  panel.append(form, feedback);
  root.append(panel);
  const listPanel = makePanel("A lista partilhada");
  const list = document.createElement("div");
  list.className = "item-list";
  const entries = Object.entries(currentItems).filter(([, item]) => item && typeof item.name === "string")
    .sort((a,b) => Number(a[1].done) - Number(b[1].done) || (a[1].createdAt || 0) - (b[1].createdAt || 0));
  if (!entries.length) list.append(makeEmpty("＋", "A lista está vazia", "Adicionem o primeiro produto para começar."));
  entries.forEach(([key, item]) => {
    const row = document.createElement("div");
    row.className = `list-row ${item.done ? "done" : ""}`;
    const check = document.createElement("input");
    check.type = "checkbox"; check.className = "check-input"; check.checked = item.done === true;
    check.setAttribute("aria-label", `Marcar ${item.name} como comprado`);
    check.addEventListener("change", async () => {
      check.disabled = true;
      try { await update(ref(db, `${paths.shopping}/${key}`), { done: check.checked }); }
      catch (e) { console.error(e); toast("Não foi possível atualizar."); check.checked = !check.checked; }
      finally { check.disabled = false; }
    });
    const main = document.createElement("div"); main.className = "list-row-main";
    main.append(safeText("p", item.name, "list-row-title"), safeText("p", item.done ? "Comprado" : `Adicionado ${formatDate(item.createdAt)}`, "list-row-meta"));
    row.append(check, main);
    addDeleteButton(row, `“${item.name}”`, () => remove(ref(db, `${paths.shopping}/${key}`)));
    list.append(row);
  });
  listPanel.append(list); root.append(listPanel);
  form.addEventListener("submit", async e => {
    e.preventDefault(); const name = input.value.trim(); if (!name) return;
    submit.disabled = true;
    try { await push(ref(db, paths.shopping), { name, done: false, uid: currentUser.uid, createdAt: Date.now() }); input.value = ""; setFeedback(feedback, "Produto adicionado!", "success"); input.focus(); }
    catch (error) { console.error(error); setFeedback(feedback, "Não foi possível adicionar. Verifica as regras da Firebase.", "error"); }
    finally { submit.disabled = false; }
  });
}
function renderTasks() {
  const root = $("#feature-content");
  root.replaceChildren(makeHeader("ORGANIZAR · PLANOS", "Tarefas partilhadas", "Transformem pequenas ideias em coisas feitas. As alterações aparecem nos dois dispositivos."));
  const panel = makePanel("Nova tarefa");
  const form = document.createElement("form"); form.className = "form-row";
  const input = makeField({ placeholder: "O que precisamos de fazer?", required: true, maxLength: 140 });
  const submit = makeButton("＋ Criar"); submit.type = "submit"; form.append(input, submit);
  const feedback = safeText("p", "", "feedback"); panel.append(form, feedback); root.append(panel);
  const listPanel = makePanel("O que temos para fazer");
  const list = document.createElement("div"); list.className = "item-list";
  const entries = Object.entries(currentTasks).filter(([,v]) => v && typeof v.title === "string").sort((a,b) => Number(a[1].done) - Number(b[1].done) || (a[1].createdAt||0)-(b[1].createdAt||0));
  if (!entries.length) list.append(makeEmpty("✓", "Tudo começa com uma ideia", "Adicionem aqui tarefas, planos ou coisas para não esquecer."));
  entries.forEach(([key, item]) => {
    const row = document.createElement("div"); row.className = `list-row ${item.done ? "done" : ""}`;
    const check = document.createElement("input"); check.type = "checkbox"; check.className = "check-input"; check.checked = item.done === true; check.setAttribute("aria-label", `Concluir ${item.title}`);
    check.addEventListener("change", async () => { try { await update(ref(db, `${paths.tasks}/${key}`), {done:check.checked, updatedAt:Date.now()}); } catch(e) { console.error(e); toast("Não foi possível atualizar a tarefa."); } });
    const main = document.createElement("div"); main.className = "list-row-main"; main.append(safeText("p", item.title, "list-row-title"), safeText("p", `${item.done ? "Concluída" : "Por fazer"} · ${formatDate(item.createdAt)}`, "list-row-meta"));
    row.append(check,main); addDeleteButton(row,`“${item.title}”`,()=>remove(ref(db,`${paths.tasks}/${key}`))); list.append(row);
  });
  listPanel.append(list); root.append(listPanel);
  form.addEventListener("submit", async e => { e.preventDefault(); const title=input.value.trim(); if(!title)return; submit.disabled=true; try{await push(ref(db,paths.tasks),{title,done:false,uid:currentUser.uid,createdAt:Date.now()});input.value="";setFeedback(feedback,"Tarefa guardada e partilhada.","success");}catch(error){console.error(error);setFeedback(feedback,"Não foi possível guardar a tarefa.","error");}finally{submit.disabled=false;} });
}
function renderFinance() {
  const root = $("#feature-content");
  root.replaceChildren(makeHeader("ORGANIZAR · DINHEIRO", "As vossas finanças", "Registem despesas para terem uma visão simples do dinheiro gasto em conjunto."));
  const total = Object.values(currentExpenses).reduce((sum,x)=>sum+(Number(x?.amount)||0),0);
  const totalPanel = document.createElement("section"); totalPanel.className = "money-total";
  const left = document.createElement("div"); left.append(safeText("small","Total de despesas registadas"),safeText("div",`${Object.keys(currentExpenses).length} registo(s)`,"list-row-meta"));
  totalPanel.append(left,safeText("strong",formatMoney(total))); root.append(totalPanel);
  const panel = makePanel("Registar uma despesa");
  const form = document.createElement("form"); form.className="item-list";
  const title = makeField({placeholder:"Descrição (ex.: jantar, supermercado)",required:true,maxLength:120});
  const row = document.createElement("div"); row.className="form-row";
  const amount = makeField({placeholder:"Valor (€)",type:"number",required:true,min:0.01,step:"0.01"});
  const payer = document.createElement("select"); payer.className="field"; payer.innerHTML='<option value="Diana">Pago por Diana</option><option value="Gonçalo">Pago por Gonçalo</option><option value="Ambos">Pago pelos dois</option>';
  row.append(amount,payer); const submit=makeButton("＋ Guardar despesa");submit.type="submit";form.append(title,row,submit);
  const feedback=safeText("p","","feedback");panel.append(form,feedback);root.append(panel);
  const listPanel=makePanel("Histórico");const list=document.createElement("div");list.className="item-list";
  const entries=Object.entries(currentExpenses).filter(([,x])=>x&&typeof x.title==="string").sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if(!entries.length)list.append(makeEmpty("€","Ainda sem despesas","Quando registarem uma despesa, aparece aqui."));
  entries.forEach(([key,item])=>{const rowEl=document.createElement("div");rowEl.className="list-row";const main=document.createElement("div");main.className="list-row-main";main.append(safeText("p",item.title,"list-row-title"),safeText("p",`${item.payer||"Partilhado"} · ${formatDate(item.createdAt)}`,"list-row-meta"));rowEl.append(main,safeText("strong",formatMoney(item.amount)));addDeleteButton(rowEl,`“${item.title}”`,()=>remove(ref(db,`${paths.expenses}/${key}`)));list.append(rowEl);});
  listPanel.append(list);root.append(listPanel);
  form.addEventListener("submit",async e=>{e.preventDefault();const value=Number(amount.value);if(!title.value.trim()||!Number.isFinite(value)||value<=0)return;submit.disabled=true;try{await push(ref(db,paths.expenses),{title:title.value.trim(),amount:value,payer:payer.value,uid:currentUser.uid,createdAt:Date.now()});title.value="";amount.value="";setFeedback(feedback,"Despesa registada.","success");}catch(error){console.error(error);setFeedback(feedback,"Não foi possível guardar a despesa.","error");}finally{submit.disabled=false;}});
}
function renderMessages() {
  const root=$("#feature-content");root.replaceChildren(makeHeader("CONVERSA · RECADO", "As vossas mensagens", "Deixem recados, ideias ou uma pequena mensagem para o outro."));
  const panel=makePanel("Escrever mensagem");const form=document.createElement("form");form.className="item-list";
  const input=document.createElement("textarea");input.className="field field-area";input.placeholder="Escreve aqui...";input.maxLength=500;input.required=true;
  const submit=makeButton("Enviar mensagem ↗");submit.type="submit";const feedback=safeText("p","","feedback");form.append(input,submit,feedback);panel.append(form);root.append(panel);
  const listPanel=makePanel("Conversa partilhada");const list=document.createElement("div");list.className="message-list";listPanel.append(list);root.append(listPanel);
  const entries=Object.entries(currentMessages).filter(([,m])=>m&&typeof m.text==="string").sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  if(!entries.length)list.append(makeEmpty("✎","Ainda não há mensagens","Enviem a primeira mensagem deste espaço."));
  entries.forEach(([key,m])=>{const card=document.createElement("article");card.className="message-card";const top=document.createElement("div");top.className="message-card-top";top.append(safeText("span",m.uid===currentUser.uid?"Tu":"Diana / Gonçalo"),safeText("time",formatDate(m.createdAt,true)));card.append(top,safeText("p",m.text));if(m.uid===currentUser.uid)addDeleteButton(card,"esta mensagem",()=>remove(ref(db,`${paths.messages}/${key}`)));list.append(card);});
  form.addEventListener("submit",async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;submit.disabled=true;try{await push(ref(db,paths.messages),{text,uid:currentUser.uid,createdAt:Date.now()});input.value="";setFeedback(feedback,"Mensagem enviada e sincronizada.","success");}catch(error){console.error(error);setFeedback(feedback,"Não foi possível enviar. Confirma as regras da Firebase.","error");}finally{submit.disabled=false;}});
}
function readGalleryLocal() {
  try { galleryItems = JSON.parse(localStorage.getItem("dicalo_gallery_local_v1") || "[]"); }
  catch { galleryItems = []; }
}
function saveGalleryLocal() {
  try { localStorage.setItem("dicalo_gallery_local_v1", JSON.stringify(galleryItems)); return true; }
  catch { toast("O armazenamento deste dispositivo está cheio. Remove algumas fotografias."); return false; }
}
function renderGallery() {
  const root=$("#feature-content");root.replaceChildren(makeHeader("NÓS · MEMÓRIAS","A nossa galeria","Guardem fotografias e pequenos momentos especiais."));
  const notice=document.createElement("div");notice.className="gallery-note";notice.textContent="Nota: nesta versão, as fotografias ficam guardadas apenas neste navegador e neste dispositivo. Ainda não são partilhadas com o outro telemóvel; para isso precisamos de configurar o armazenamento de imagens na nuvem.";root.append(notice);
  const panel=makePanel("Adicionar uma fotografia");const form=document.createElement("form");form.className="item-list";
  const file=document.createElement("input");file.className="field";file.type="file";file.accept="image/*";file.capture="environment";
  const caption=makeField({placeholder:"Legenda (opcional)",maxLength:100});
  const submit=makeButton("＋ Guardar fotografia");submit.type="submit";const feedback=safeText("p","","feedback");form.append(file,caption,submit,feedback);panel.append(form);root.append(panel);
  const listPanel=makePanel("Momentos guardados");const grid=document.createElement("div");grid.className="photo-grid";listPanel.append(grid);root.append(listPanel);
  const draw=()=>{grid.replaceChildren();if(!galleryItems.length){grid.append(makeEmpty("▧","A galeria está à espera","Escolhe uma fotografia para começar."));return;}galleryItems.forEach(item=>{const card=document.createElement("article");card.className="photo-card";const img=document.createElement("img");img.src=item.data;img.alt=item.caption||"Fotografia guardada";const text=safeText("p",item.caption||"Um momento nosso");const del=makeButton("Apagar","delete-button",()=>{galleryItems=galleryItems.filter(x=>x.id!==item.id);saveGalleryLocal();draw();});card.append(img,text,del);grid.append(card);});};draw();
  form.addEventListener("submit",e=>{e.preventDefault();const chosen=file.files?.[0];if(!chosen){setFeedback(feedback,"Escolhe uma fotografia primeiro.","error");return;}if(!chosen.type.startsWith("image/")){setFeedback(feedback,"Escolhe um ficheiro de imagem.","error");return;}if(chosen.size>5*1024*1024){setFeedback(feedback,"Escolhe uma imagem com menos de 5 MB.","error");return;}submit.disabled=true;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement("canvas");const scale=Math.min(1,1000/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL("image/jpeg",.76);galleryItems.unshift({id:`${Date.now()}_${Math.random().toString(36).slice(2,8)}`,data,caption:caption.value.trim(),createdAt:Date.now()});if(saveGalleryLocal()){caption.value="";file.value="";setFeedback(feedback,"Fotografia guardada neste dispositivo.","success");draw();}submit.disabled=false;};img.onerror=()=>{setFeedback(feedback,"Não foi possível ler a imagem.","error");submit.disabled=false;};img.src=reader.result;};reader.onerror=()=>{setFeedback(feedback,"Não foi possível abrir a fotografia.","error");submit.disabled=false;};reader.readAsDataURL(chosen);});
}
const gameQuestions=[
  {q:"Qual seria o plano perfeito para um dia livre?",a:["Ficar em casa e descansar","Sair à aventura","Comer qualquer coisa boa","Um pouco de tudo"]},
  {q:"O que conta mais num encontro?",a:["Surpresa inesperada","Boa comida","Conversar sem pressa","Fazer algo diferente"]},
  {q:"Escolham a próxima mini-aventura:",a:["Piquenique ao pôr do sol","Uma cidade nova","Noite de jogos","Experimentar um restaurante"]},
  {q:"Qual é a melhor recordação?",a:["Uma gargalhada parva","Um passeio juntos","Um dia especial","Um momento simples"]},
  {q:"Hoje apetece mais...",a:["Conforto e manta","Passeio sem destino","Competição amigável","Uma sobremesa"]},
  {q:"Se ganhassem um dia livre extra...",a:["Fazíamos uma viagem","Dormíamos até tarde","Explorávamos um sítio","Fazíamos tudo sem pressa"]}
];
const dateIdeas=["Façam um piquenique com três coisas que já têm em casa.","Escolham uma rua onde nunca passearam e explorem-na.","Cada um escolhe uma música e explica a memória que lhe traz.","Preparem juntos uma receita nova.","Façam uma noite sem telemóveis durante uma hora.","Escolham fotografias antigas e contem a história por trás delas.","Façam uma competição de jogos com um prémio simbólico.","Vão ver o pôr do sol num sítio diferente.","Escolham um filme à vez sem revelar a escolha.","Planeiem uma viagem de sonho com orçamento imaginário."];
function renderGames() {
  const root=$("#feature-content");root.replaceChildren(makeHeader("DIVERSÃO · A DOIS","Vamos jogar?","Pequenos jogos para sair da rotina e inventar planos."));
  const grid=document.createElement("div");grid.className="game-grid";root.append(grid);
  const quiz=makePanel("✦ · Quem conhece melhor quem?");quiz.append(safeText("p","Respondam à mesma pergunta e comparem as respostas. Não há respostas erradas.","muted"));const quizArea=document.createElement("div");quizArea.className="game-result";const nextQuestion=makeButton("Começar pergunta ↗");let qIndex=-1;nextQuestion.addEventListener("click",()=>{qIndex=(qIndex+1)%gameQuestions.length;const q=gameQuestions[qIndex];quizArea.replaceChildren(safeText("strong",q.q));const choices=document.createElement("div");choices.className="choice-row";q.a.forEach(answer=>{const b=makeButton(answer,"choice-button",()=>{ $$(".choice-button",choices).forEach(x=>x.classList.remove("selected"));b.classList.add("selected");});choices.append(b);});quizArea.append(choices,safeText("p","Cada um escolhe a sua resposta e depois comparem!"));});quiz.append(quizArea,nextQuestion);grid.append(quiz);
  const roulette=makePanel("↗ · Roleta de encontros");roulette.append(safeText("p","Sem ideias para hoje? Deixem a DICALO escolher uma sugestão.","muted"));const result=safeText("div","A próxima aventura pode começar aqui.","game-result");const spin=makeButton("Surpreende-nos ✳", "button button-primary",()=>{result.textContent=dateIdeas[Math.floor(Math.random()*dateIdeas.length)];});roulette.append(result,spin);grid.append(roulette);
  const thisOrThat=makePanel("⇄ · Isto ou aquilo");thisOrThat.append(safeText("p","Escolham uma opção cada um e vejam se combinam.","muted"));const pairs=[["Praia","Montanha"],["Filme","Série"],["Doce","Salgado"],["Ficar em casa","Sair"],["Viagem planeada","Aventura espontânea"]];let pairIndex=0;const pairText=safeText("h3",`${pairs[0][0]} ou ${pairs[0][1]}`);const options=document.createElement("div");options.className="choice-row";let chosen=[];const drawPair=()=>{pairText.textContent=`${pairs[pairIndex][0]} ou ${pairs[pairIndex][1]}`;options.replaceChildren();chosen=[];pairs[pairIndex].forEach(value=>{const b=makeButton(value,"choice-button",()=>{chosen.push(value);b.classList.add("selected");b.disabled=true;if(chosen.length===2){resultPair.textContent=chosen[0]===chosen[1]?`Concordaram: ${chosen[0]}!`:`Duas escolhas diferentes: ${chosen.join(" e ")}.`;}});options.append(b);});};const resultPair=safeText("div","Escolham uma opção cada um.","game-result");const more=makeButton("Próxima escolha →","button button-primary",()=>{pairIndex=(pairIndex+1)%pairs.length;drawPair();resultPair.textContent="Escolham uma opção cada um.";});drawPair();thisOrThat.append(pairText,options,resultPair,more);grid.append(thisOrThat);
}
function updateWelcomeDate() {
  const el=$("#welcome-date");
  if(el)el.textContent=new Intl.DateTimeFormat("pt-PT",{weekday:"long",day:"numeric",month:"long"}).format(new Date()).toUpperCase();
}
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    setScreen("app");
    updateDailyMessage();
    updateWelcomeDate();
    readGalleryLocal();
    startSharedListeners();
    // Keep the existing messages path and listen in real time.
    if (window.__dicaloMessagesStop) window.__dicaloMessagesStop();
    window.__dicaloMessagesStop = subscribe(paths.messages, data => {
      currentMessages = data;
      if (activeView === "notes") renderMessages();
    });
    updateHomeStats();
  } else {
    stopSharedListeners();
    if (window.__dicaloMessagesStop) window.__dicaloMessagesStop();
    window.__dicaloMessagesStop = null;
    setScreen("auth");
  }
});
