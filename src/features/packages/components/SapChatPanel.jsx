import { useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';

export default function SapChatPanel({ connectionServerName, error }) {
  const [prompt, setPrompt] = useState('');

  function preventSubmission(event) {
    event.preventDefault();
  }

  return (
    <section className="sap-chat-panel">
      <div className="run-status-row sap-chat-header">
        <div><p className="eyebrow">AI ASSISTANT TERMINAL</p><h2>SAP Development Automation</h2></div>
        <div className="sap-chat-header-actions">
          {connectionServerName ? (
            <span className="sap-server-chip">
              <span aria-hidden="true" className="sap-server-chip__dot" />
              <span>Connected</span>
              <strong>· {connectionServerName}</strong>
            </span>
          ) : null}
          <AppButton title="OAuth Token" variant="secondary" />
          <span className="run-status run-status--completed">Ready</span>
        </div>
      </div>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      <div className="sap-conversation">
        <div className="sap-chat-welcome">
          <Icon name="code" size={36} />
          <h3>What would you like to build?</h3>
          <p>Your SAP Development assistant will appear here.</p>
        </div>
      </div>

      <form className="sap-prompt-form" onSubmit={preventSubmission}>
        <textarea
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
          }}
          placeholder="Ask the AI Assistant about SAP development..."
          value={prompt}
        />
        <div>
          <span>Enter to send · Shift+Enter for a new line</span>
          <AppButton disabled title="Send" type="submit" />
        </div>
      </form>
    </section>
  );
}
