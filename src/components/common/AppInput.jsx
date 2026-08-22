import { forwardRef } from 'react';

import Icon from './Icon';

const AppInput = forwardRef(function AppInput(
  { error, icon, label, onToggleVisibility, type, ...inputProps },
  ref,
) {
  const inputId = inputProps.id || inputProps.name;
  const errorId = error ? `${inputId}-error` : undefined;
  const isPassword = inputProps.name === 'password';

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>{label}</label>
      <div className={`field__control ${error ? 'field__control--error' : ''}`}>
        {icon ? <Icon className="field__leading-icon" name={icon} size={18} /> : null}
        <input
          {...inputProps}
          aria-describedby={errorId}
          aria-invalid={Boolean(error)}
          className="field__input"
          id={inputId}
          ref={ref}
          type={type}
        />
        {isPassword ? (
          <button
            aria-label={type === 'password' ? 'Show password' : 'Hide password'}
            className="icon-button"
            onClick={onToggleVisibility}
            type="button"
          >
            <Icon name={type === 'password' ? 'eye' : 'eyeOff'} />
          </button>
        ) : null}
      </div>
      {error ? <p className="field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
});

export default AppInput;
