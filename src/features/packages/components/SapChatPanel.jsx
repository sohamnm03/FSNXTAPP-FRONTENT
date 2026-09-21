import { useEffect, useRef } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';

const statusLabels = {
  idle: 'Ready',
  running: 'AI Assistant is working',
  completed: 'Ready',
  failed: 'Needs attention',
  stopped: 'Stopped',
  stopping: 'Stopping',
};

export default function SapChatPanel({
  connectionServerName,
  error,
  isAuthenticated,
  isBusy,
  isStarting,
  isStopping,
  messages,
  onOpenToken,
  onPromptChange,
  onStop,
  onSubmit,
  prompt,
  status,
}) {
  const conversationRef = useRef(null);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, status]);

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
          <AppButton disabled={isBusy} onClick={onOpenToken} title="OAuth Token" variant="secondary" />
          <span className={`run-status run-status--${status}`}>
            {isAuthenticated ? statusLabels[status] || 'Ready' : 'OAuth token required'}
          </span>
        </div>
      </div>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      <div className="sap-conversation" ref={conversationRef}>
        {messages.length === 0 ? (
          <div className="sap-chat-welcome">
            <Icon name="code" size={36} />
            <h3>{isAuthenticated ? 'What would you like to build?' : 'Connect a Claude OAuth token to begin'}</h3>
            <p>{connectionServerName
              ? 'Claude Code will use the SAP Development companion workspace.'
              : 'Test your SAP connection before starting a development request.'}</p>
          </div>
        ) : messages.map((message) => (
          <article className={`sap-message sap-message--${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? 'You' : 'AI Assistant'}</span>
            <div>{message.text}</div>
          </article>
        ))}
        {status === 'running' || status === 'stopping' ? (
          <div className="sap-thinking"><span /><span /><span /> SAP Development Assistant is working...</div>
        ) : null}
      </div>

      <form className="sap-prompt-form" onSubmit={onSubmit}>
        <textarea
          disabled={!isAuthenticated || !connectionServerName || isBusy}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask the AI Assistant about SAP development..."
          value={prompt}
        />
        <div>
          <span>Enter to send · Shift+Enter for a new line</span>
          {status === 'running' || status === 'stopping' ? (
            <AppButton disabled={status === 'stopping'} loading={isStopping} onClick={onStop} title="Stop" variant="secondary" />
          ) : (
            <AppButton disabled={!isAuthenticated || !connectionServerName || !prompt.trim() || isBusy} loading={isStarting} title="Send" type="submit" />
          )}
        </div>
      </form>
    </section>
  );
}
