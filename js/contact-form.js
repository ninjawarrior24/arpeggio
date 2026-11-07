(() => {
  const recipients = ['ragarrity17@gmail.com'];

  document.querySelectorAll('form[data-contact-form]').forEach((form) => {
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('.form-status');

    function show(message, error = true) {
      status.textContent = message;
      status.style.color = error ? '#d00' : '#0a0';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (form.elements._gotcha.value) return;

      const firstName = form.elements.fname.value.trim();
      const lastName = form.elements.lname.value.trim();
      const email = form.elements.email.value.trim();
      const message = form.elements.message.value.trim();
      if (!firstName || !/^\S+@\S+\.\S+$/.test(email) || message.length < 5) {
        show('Please provide a valid name, email, and message.');
        return;
      }

      submit.disabled = true;
      show('Sending…', false);
      const data = new FormData(form);
      data.set('name', [firstName, lastName].filter(Boolean).join(' '));
      try {
        await Promise.all(recipients.map(async (address) => {
          const response = await fetch('https://shipmyform.com/to/' + encodeURIComponent(address), {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: data
          });
          if (!response.ok) throw new Error('A recipient did not accept the message.');
        }));
        window.location.assign('thankyou.html?success=1');
      } catch {
        show('Unable to send your message. Please try again later.');
        submit.disabled = false;
      }
    });
  });
})();
