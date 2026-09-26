import { useState } from 'react';

import type { Translations } from '../i18n';

interface Props {
  t: Translations['contact']['inquire'];
}

export default function ContactForm({ t }: Props) {
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSending(true);
    try {
      const response = await fetch('/send_email.php', {
        method: 'POST',
        body: new FormData(form),
      });
      const data = await response.text();
      if (data.includes('successfully')) {
        alert(t.success);
        form.reset();
      } else {
        alert(t.error);
        console.error('Error:', data);
      }
    } catch (error) {
      alert(t.error);
      console.error('Error:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <form id="contactForm" onSubmit={handleSubmit}>
      <p>
        <label htmlFor="name">{t.name}</label>
      </p>
      <input type="text" id="name" name="name" required />
      <br />

      <p>
        <label htmlFor="email">{t.email}</label>
      </p>
      <input type="email" id="email" name="email" required />
      <br />

      <p>
        <label htmlFor="message">{t.message}</label>
      </p>
      <textarea id="message" name="message" required></textarea>
      <br />

      <div id="f_submit">
        <button type="submit" disabled={sending}>
          {t.submit}
        </button>
      </div>
    </form>
  );
}
