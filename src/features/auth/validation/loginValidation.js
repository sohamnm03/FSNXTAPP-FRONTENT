export function validateLogin(values) {
  const errors = {};
  if (!values.username.trim()) errors.username = 'Username is required.';
  if (!values.password) errors.password = 'Password is required.';
  return errors;
}
