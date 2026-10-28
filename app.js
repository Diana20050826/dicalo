
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getDatabase,
  ref,
  push,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// 1. Mantém aqui os teus valores reais da Firebase.
const firebaseConfig = {databaseURL: "https://dicalo-c5a8d-default-rtdb.europe-west1.firebasedatabase.app",
  apiKey: "AIzaSyCAalkXPWqX1JkXpzHBSmyRigXCd7PCpKc",
  authDomain: "dicalo-c5a8d.firebaseapp.com",
  projectId: "dicalo-c5a8d",
  storageBucket: "dicalo-c5a8d.firebasestorage.app",
  messagingSenderId: "762312604990",
  appId: "1:762312604990:web:4338a94799c5e50dea406f"
  
};

// IMPORTANTE: se já tinhas os teus valores reais, copia-os para
// este objeto antes de guardar. Não os substituas pelos exemplos.

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

// 2. Elementos reais do teu HTML.
const $ = (selector) => document.querySelector(selector);

const authScreen = $("#auth-screen");
const appScreen = $("#app-screen");
const loadingScreen = $("#loading-screen");

const authForm = $("#auth-form");
const emailInput = $("#auth-email");
const passwordInput = $("#auth-password");
const authSubmit = $("#auth-submit");
const authToggle = $("#toggle-auth");
const authForgot = $("#forgot-password");
const authStatus = $("#auth-message");

let creatingAccount = false;
let currentUser = null;
let stopMessagesListener = null;

function showScreen(screen) {
  authScreen?.classList.toggle("hidden", screen !== "auth");
  appScreen?.classList.toggle("hidden", screen !== "app");
  loadingScreen?.classList.toggle("hidden", screen !== "loading");
}

function showAuthMessage(message, type = "") {
  if (!authStatus) return;

  authStatus.textContent = message;
  authStatus.className = "feedback";

  if (type) {
    authStatus.classList.add(type);
  }
}

function showToast(message) {
  let toast = $("#dicalo-toast");

  if (!toast) {
    toast = document.createElement("p");
    toast.id = "dicalo-toast";
    toast.className = "feedback";
    toast.setAttribute("role", "status");
    document.querySelector("main")?.prepend(toast);
  }

  if (toast) toast.textContent = message;
}

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já tem uma conta.",
    "auth/invalid-email": "O endereço de e-mail não é válido.",
    "auth/invalid-credential": "E-mail ou palavra-passe incorretos.",
    "auth/weak-password": "Usa uma palavra-passe com pelo menos 6 caracteres.",
    "auth/operation-not-allowed": "Ativa E-mail/Palavra-passe na Firebase Authentication.",
    "auth/network-request-failed": "Não foi possível ligar à Internet.",
    "auth/too-many-requests": "Demasiadas tentativas. Tenta mais tarde."
  };

  return messages[error.code] || `Erro: ${error.code || error.message}`;
}

// 3. Alternar entre entrar e criar conta.
authToggle?.addEventListener("click", () => {
  creatingAccount = !creatingAccount;

  if (authSubmit) {
    authSubmit.textContent = creatingAccount ? "Criar conta" : "Entrar";
  }

  if (authToggle) {
    authToggle.textContent = creatingAccount
      ? "Já tens conta? Entrar"
      : "Ainda não tens conta? Criar conta";
  }

  if (passwordInput) {
    passwordInput.autocomplete = creatingAccount
      ? "new-password"
      : "current-password";
  }

  showAuthMessage("");
  console.log("Modo de autenticação:", creatingAccount ? "registo" : "login");
});

// 4. Enviar formulário.
authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  console.log("Formulário de autenticação acionado.");
  showAuthMessage("");

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showAuthMessage("Preenche o e-mail e a palavra-passe.", "error");
    return;
  }

  if (creatingAccount && password.length < 6) {
    showAuthMessage("A palavra-passe deve ter pelo menos 6 caracteres.", "error");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = creatingAccount ? "A criar conta..." : "A entrar...";

  try {
    if (creatingAccount) {
      await createUserWithEmailAndPassword(auth, email, password);
      showAuthMessage("Conta criada com sucesso!", "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    console.error("Erro Firebase Authentication:", error);
    showAuthMessage(friendlyError(error), "error");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = creatingAccount ? "Criar conta" : "Entrar";
  }
});

// 5. Recuperar palavra-passe.
authForgot?.addEventListener("click", async () => {
  const email = emailInput?.value.trim();

  if (!email) {
    showAuthMessage("Escreve o teu e-mail primeiro.", "error");
    emailInput?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthMessage(
      "Se existir uma conta associada, receberás instruções por e-mail.",
      "success"
    );
  } catch (error) {
    console.error(error);
    showAuthMessage(friendlyError(error), "error");
  }
});

// 6. Mensagem do dia.
const dailyMessages = [
  "Os pequenos planos também contam.",
  "A vida flui melhor quando partilhamos o caminho.",
  "Um dia de cada vez, juntos nos vossos planos.",
  "As melhores memórias começam com coisas simples.",
  "Há sempre espaço para mais uma ideia."
];

let messageIndex = new Date().getDate() % dailyMessages.length;

function updateDailyMessage() {
  const message = $("#daily-message");
  if (message) message.textContent = dailyMessages[messageIndex];
}

$("#change-message")?.addEventListener("click", () => {
  messageIndex = (messageIndex + 1) % dailyMessages.length;
  updateDailyMessage();
});

function renderMessages() {
  const featureContent = $("#feature-content");
  if (!featureContent || !currentUser) return;

  // Parar a subscrição anterior, se existir.
  if (stopMessagesListener) {
    stopMessagesListener();
    stopMessagesListener = null;
  }

  featureContent.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "As nossas mensagens";

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = "Ideias, recados e pequenas coisas do dia a dia.";

  const form = document.createElement("form");
  form.className = "message-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Escreve uma mensagem...";
  input.maxLength = 500;
  input.required = true;
  input.setAttribute("aria-label", "Nova mensagem");

  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.className = "button button-primary";
  sendButton.textContent = "Enviar";

  const feedback = document.createElement("p");
  feedback.className = "feedback";
  feedback.setAttribute("role", "status");

  const list = document.createElement("div");
  list.className = "message-list";

  form.append(input, sendButton);
  featureContent.append(heading, description, form, feedback, list);

  const messagesRef = ref(db, "duos/diana-goncalo/messages");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text || !currentUser) return;

    sendButton.disabled = true;
    feedback.textContent = "A enviar...";

    try {
      await push(messagesRef, {
        text,
        uid: currentUser.uid,
        createdAt: Date.now()
      });

      input.value = "";
      feedback.textContent = "Mensagem enviada!";
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      feedback.textContent =
        "Não foi possível enviar. Confirma a ligação e as regras da Firebase.";
    } finally {
      sendButton.disabled = false;
    }
  });

  stopMessagesListener = onValue(
    messagesRef,
    (snapshot) => {
      list.replaceChildren();

      if (!snapshot.exists()) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Ainda não há mensagens. Escrevam a primeira!";
        list.append(empty);
        return;
      }

      snapshot.forEach((child) => {
        const message = child.val();
        if (!message || typeof message.text !== "string") return;

        const card = document.createElement("article");
        card.className = "message-card";

        const author = document.createElement("strong");
        author.textContent =
          message.uid === currentUser.uid
            ? "Tu"
            : "Gonçalo / Diana";

        const body = document.createElement("p");
        body.textContent = message.text;

        const date = document.createElement("small");
        date.className = "muted";
        date.textContent = Number.isFinite(message.createdAt)
          ? new Intl.DateTimeFormat("pt-PT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            }).format(new Date(message.createdAt))
          : "";

        card.append(author, body, date);

        if (message.uid === currentUser.uid) {
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "text-button";
          deleteButton.textContent = "Apagar";

          deleteButton.addEventListener("click", async () => {
            const confirmed = window.confirm(
              "Queres apagar esta mensagem?"
            );
            if (!confirmed) return;

            try {
              await remove(ref(db, `duos/diana-goncalo/messages/${child.key}`));
            } catch (error) {
              console.error("Erro ao apagar mensagem:", error);
              feedback.textContent = "Não foi possível apagar a mensagem.";
            }
          });

          card.append(deleteButton);
        }

        list.append(card);
      });
    },
    (error) => {
      console.error("Erro ao carregar mensagens:", error);
      feedback.textContent =
        "Não foi possível carregar as mensagens. Verifica as regras da Firebase.";
    }
  );
}

function renderShopping() {
  const featureContent = $("#feature-content");
  if (!featureContent || !currentUser) return;

  if (stopMessagesListener) {
    stopMessagesListener();
    stopMessagesListener = null;
  }

  featureContent.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "A nossa lista de compras";

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent =
    "Adicionem o que falta e assinalem o que já compraram.";

  const form = document.createElement("form");
  form.className = "message-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ex.: leite, pão, fruta...";
  input.maxLength = 100;
  input.required = true;
  input.setAttribute("aria-label", "Produto a adicionar");

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "button button-primary";
  addButton.textContent = "Adicionar";

  const feedback = document.createElement("p");
  feedback.className = "feedback";
  feedback.setAttribute("role", "status");

  const list = document.createElement("div");
  list.className = "shopping-list";

  form.append(input, addButton);
  featureContent.append(heading, description, form, feedback, list);

  const shoppingRef = ref(db, "duos/diana-goncalo/shopping");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = input.value.trim();
    if (!name || !currentUser) return;

    addButton.disabled = true;

    try {
      await push(shoppingRef, {
        name,
        done: false,
        uid: currentUser.uid,
        createdAt: Date.now()
      });

      input.value = "";
      feedback.textContent = "Produto adicionado à lista!";
      input.focus();
    } catch (error) {
      console.error("Erro ao adicionar produto:", error);
      feedback.textContent = "Não foi possível adicionar o produto.";
    } finally {
      addButton.disabled = false;
    }
  });

  stopMessagesListener = onValue(
    shoppingRef,
    (snapshot) => {
      list.replaceChildren();

      if (!snapshot.exists()) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "A lista está vazia. Adicionem o primeiro produto!";
        list.append(empty);
        return;
      }

      snapshot.forEach((child) => {
        const item = child.val();
        if (!item || typeof item.name !== "string") return;

        const row = document.createElement("div");
        row.className = "shopping-item";

        const label = document.createElement("label");
        label.className = "shopping-item-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.done === true;
        checkbox.setAttribute(
          "aria-label",
          `Marcar ${item.name} como comprado`
        );

        const name = document.createElement("span");
        name.textContent = item.name;

        if (item.done === true) {
          name.classList.add("shopping-done");
        }

        checkbox.addEventListener("change", async () => {
          checkbox.disabled = true;

          try {
            await update(
              ref(db, `duos/diana-goncalo/shopping/${child.key}`),
              { done: checkbox.checked }
            );
          } catch (error) {
            console.error("Erro ao atualizar produto:", error);
            feedback.textContent = "Não foi possível atualizar o produto.";
          } finally {
            checkbox.disabled = false;
          }
        });

        label.append(checkbox, name);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "text-button";
        deleteButton.textContent = "Apagar";
        deleteButton.setAttribute("aria-label", `Apagar ${item.name}`);

        deleteButton.addEventListener("click", async () => {
          deleteButton.disabled = true;

          try {
            await remove(
              ref(db, `duos/diana-goncalo/shopping/${child.key}`)
            );
            feedback.textContent = "Produto removido.";
          } catch (error) {
            console.error("Erro ao apagar produto:", error);
            feedback.textContent = "Não foi possível apagar o produto.";
          } finally {
            deleteButton.disabled = false;
          }
        });

        row.append(label, deleteButton);
        list.append(row);
      });
    },
    (error) => {
      console.error("Erro ao carregar a lista:", error);
      feedback.textContent =
        "Não foi possível carregar a lista. Verifica as regras da Firebase.";
    }
  );
}

// 7. Navegação das funcionalidades.
const features = {
  shopping: {
    title: "Compras",
    description: "As vossas listas partilhadas."
  },
  finance: {
    title: "Finanças",
    description: "Despesas, poupanças e objetivos."
  },
  gallery: {
    title: "Galeria",
    description: "Um espaço para os vossos momentos."
  },
  tasks: {
    title: "Tarefas",
    description: "Planos e tarefas para organizar o dia."
  },
  notes: {
    title: "Mensagens",
    description: "Notas, ideias e lembretes."
  },
  games: {
    title: "Jogos",
    description: "Desafios e perguntas a dois."
  }
};

function openView(view) {
  const featureView = $("#feature-view");
  const featureContent = $("#feature-content");

  if (!featureView || !featureContent) return;

  // Voltar ao início
  if (view === "home") {
    if (stopMessagesListener) {
      stopMessagesListener();
      stopMessagesListener = null;
    }

    featureView.classList.add("hidden");

    document.querySelector(".feature-grid")
      ?.closest(".section-block")
      ?.classList.remove("hidden");

    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.classList.toggle("active", button.dataset.nav === "home");
    });

    return;
  }

  // Parar de ouvir mensagens ao sair dessa funcionalidade
  if (view !== "notes" && stopMessagesListener) {
    stopMessagesListener();
    stopMessagesListener = null;
  }

  // Mensagens partilhadas
  if (view === "notes") {
    document.querySelector(".feature-grid")
      ?.closest(".section-block")
      ?.classList.add("hidden");

    featureView.classList.remove("hidden");
    renderMessages();
  }

  // Lista de compras partilhada
  else if (view === "shopping") {
    document.querySelector(".feature-grid")
      ?.closest(".section-block")
      ?.classList.add("hidden");

    featureView.classList.remove("hidden");
    renderShopping();
  }

  // Restantes funcionalidades
  else {
    const info = features[view];
    if (!info) return;

    featureContent.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = info.title;

    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = info.description;

    const placeholder = document.createElement("p");
    placeholder.className = "feedback";
    placeholder.textContent =
      "Esta funcionalidade será construída em breve.";

    featureContent.append(heading, description, placeholder);

    document.querySelector(".feature-grid")
      ?.closest(".section-block")
      ?.classList.add("hidden");

    featureView.classList.remove("hidden");
  }

  // Atualizar botão selecionado
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === view);
  });
}

// Botões das funcionalidades
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.view));
});

// Navegação inferior
document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => openView(button.dataset.nav));
});

// Botão para voltar ao início
$("#back-home")?.addEventListener("click", () => openView("home"));

// 8. Terminar sessão
$("#logout-button")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível terminar a sessão.");
  }
});

// 9. Estado de autenticação
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    showScreen("app");
    updateDailyMessage();

    const dateElement = $("#welcome-date");

    if (dateElement) {
      dateElement.textContent = new Intl.DateTimeFormat("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long"
      }).format(new Date()).toUpperCase();
    }

    console.log("Sessão iniciada:", user.uid);
  } else {
    showScreen("auth");
  }
});

console.log("DICALO preparada para inicialização.");
