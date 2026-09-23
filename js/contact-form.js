(() => {
  const config = window.ARPEGGIO_CONTACT || {};

  function statusFor(form) {
    let status = form.querySelector(".form-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "form-status";
      status.setAttribute("aria-live", "polite");
      form.append(status);
    }
    return status;
  }

  function setStatus(form, message, isError = true) {
    const status = statusFor(form);
    status.textContent = message;
    status.style.color = isError ? "#d00" : "#0a0";
  }

  function loadTurnstile(form) {
    return new Promise((resolve, reject) => {
      if (!config.turnstileSiteKey) return reject(new Error("missing-site-key"));
      const render = () => {
        const slot = form.querySelector("[data-turnstile]");
        if (!slot || slot.dataset.ready) return resolve();
        window.turnstile.render(slot, { sitekey: config.turnstileSiteKey });
        slot.dataset.ready = "true";
        resolve();
      };
      if (window.turnstile) return render();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  document.querySelectorAll("form[data-contact-form]").forEach(async (form) => {
    const submit = form.querySelector('[type="submit"]');
    const verification = document.createElement("div");
    verification.dataset.turnstile = "";
    verification.className = "turnstile-widget";
    submit.before(verification);

    try {
      await loadTurnstile(form);
    } catch {
      setStatus(form, "The contact form is not configured yet. Please try again later.");
      if (submit) submit.disabled = true;
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = (form.querySelector('[name="name"], [name="fname"]')?.value || "").trim();
      const lastName = (form.querySelector('[name="lname"]')?.value || "").trim();
      const fullName = [name, lastName].filter(Boolean).join(" ");
      const email = (form.querySelector('[name="email"]')?.value || "").trim();
      const message = (form.querySelector('[name="message"]')?.value || "").trim();
      const website = (form.querySelector('[name="website"]')?.value || "").trim();
      const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value || "";

      if (!config.endpoint) return setStatus(form, "The contact form is not configured yet. Please try again later.");
      if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || message.length < 5) {
        return setStatus(form, "Please provide a valid name, email, and message.");
      }

      submit.disabled = true;
      setStatus(form, "Sending…", false);
      try {
        const result = await fetch(config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: fullName, email, message, website, turnstileToken }),
        });
        const payload = await result.json().catch(() => ({}));
        if (!result.ok) throw new Error(payload.error || "Unable to send the message.");
        window.location.assign("thankyou.html?success=1");
      } catch (error) {
        setStatus(form, error.message || "Unable to send the message. Please try again later.");
        if (window.turnstile) window.turnstile.reset(verification);
        submit.disabled = false;
      }
    });
  });
})();
