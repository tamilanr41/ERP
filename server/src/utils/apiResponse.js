export const success = (res, data = null, message = 'Operation successful', pagination = undefined, statusCode = 200) => {
  const body = { success: true, message, data };
  if (pagination) body.pagination = pagination;
  res.status(statusCode).json(body);
};

export const created = (res, data = null, message = 'Created successfully') =>
  success(res, data, message, undefined, 201);

export const failure = (res, message = 'Operation failed', errors = undefined, statusCode = 400) => {
  const body = { success: false, message, errors };
  res.status(statusCode).json(body);
};