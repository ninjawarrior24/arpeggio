(() => {
  document.querySelectorAll('form[data-contact-form]').forEach((form) => {
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('.form-status');

    function show(message, isError = true) {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
      status.classList.toggle('is-success', !isError);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const values = new FormData(form);
      if (values.get('website')) return;

      const payload = {
        name: String(values.get('name') || '').trim(),
        email: String(values.get('email') || '').trim(),
        message: String(values.get('message') || '').trim(),
        website: '',
        turnstileToken: String(values.get('cf-turnstile-response') || ''),
      };

      if (!payload.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.message.length < 5) {
        show('Please provide a valid name, email, and message.');
        return;
      }
      if (!payload.turnstileToken) {
        show('Please complete the verification check.');
        return;
      }

      submit.disabled = true;
      show('Sending…', false);
      try {
        const response = await fetch(window.ARPEGGIO_CONTACT.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) {
          throw new Error(result.error || 'Unable to send your message. Please try again.');
        }
        form.reset();
        if (window.turnstile) window.turnstile.reset();
        show('Thanks — your message was sent.', false);
      } catch (error) {
        show(error.message || 'Unable to send your message. Please try again.');
        if (window.turnstile) window.turnstile.reset();
      } finally {
        submit.disabled = false;
      }
    });
  });
})();