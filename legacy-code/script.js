let currentLanguage = localStorage.getItem("language") || "en";
let translations = {};

document.addEventListener("DOMContentLoaded", function () {
  // Set language
  document.getElementById("language-select").value = currentLanguage;
  loadLanguage(currentLanguage).then(() => {
    updateContent();
  });

  // Set up listener for inquiry
  const form = document.getElementById("contactForm");
  if (form) form.addEventListener("submit", sendMail);
});

async function changeLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem("language", lang);

  document.getElementById("language-select").value = lang;

  await loadLanguage(lang);
  updateContent();
}

// Load language file
async function loadLanguage(lang) {
  try {
    const response = await fetch(`./languages/${lang}.json`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    translations = await response.json();
  } catch (error) {
    console.error("Error loading language file:", error);
    // Fallback to English if there's an error
    if (lang !== "en") {
      await loadLanguage("en");
    }
  }
}

// Update page content with translations
function updateContent() {
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach((element) => {
    const keys = element.getAttribute("data-i18n").split(".");
    let value = translations;

    // Navigate through the nested keys
    for (const key of keys) {
      if (value && value[key]) {
        value = value[key];
      } else {
        value = null;
        break;
      }
    }

    if (value) {
      element.textContent = value;
    }
  });
}

document.addEventListener("scroll", () => {
  let position = window.scrollY;
  position > 20 ? nowSticky() : notSticky();
});

function nowSticky() {
  let x = document.getElementById("h_bar");
  x.className = "sticky isSticky";
}
function notSticky() {
  let x = document.getElementById("h_bar");
  x.className = "sticky";
}

/* Hamburger nav dropdown */
function dropDown() {
  let y = document.getElementById("nav_container");
  let x = document.getElementById("darker");
  x.style.display = "block";
  y.focus();
  y.style.transition = "all 0.1s linear";
  y.style.right = "0rem";
}

function closeNav() {
  let y = document.getElementById("nav_container");
  let x = document.getElementById("darker");
  x.style.display = "none";
  y.style.transition = "all 0.1s linear";
  y.style.right = "-16rem";
}

function handleBlur(e) {
  const cTarget = e;
  let y = document.getElementById("nav_container");
  let x = document.getElementById("darker");
  y.style.transition = "all 0.1s linear";

  requestAnimationFrame(() => {
    if (cTarget.contains(document.activeElement)) {
    } else {
      x.style.display = "none";
      y.style.right = "-16rem";
    }
  });
}

function notWorking() {
  alert(
    "sorry, this function is not implemented yet! Please send your inquires via email or give us a call."
  );
}

function sendMail(event) {
  event.preventDefault();

  const form = document.getElementById("contactForm");
  const formData = new FormData(form);

  fetch("send_email.php", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.text())
    .then((data) => {
      if (data.includes("successfully")) {
        const success =
          translations?.contact?.inquire?.success ||
          "Your inquiry has been sent successfully.";
        alert(success);
        form.reset();
      } else {
        const errorMessage =
          translations?.contact?.inquire?.error ||
          "There was an error sending your message. Please try again later.";
        alert(errorMessage);
        console.error("Error:", data);
      }
    })
    .catch((error) => {
      const errorMessage =
        translations?.contact?.inquire?.error ||
        "There was an error sending your message. Please try again later.";
      alert(errorMessage);
      console.error("Error:", error);
    });
}
