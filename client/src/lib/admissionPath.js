/**
 * Builds an admission workspace path only from a real admission id.
 * Prevents broken URLs like /ipd/admission/undefined from stale lists,
 * populated documents or optional references.
 */
export const admissionPath = (id, tab) => {
  const value = id?._id || id?.admissionId || id;
  if (!value || !/^[a-f\d]{24}$/i.test(String(value))) return null;
  return `/ipd/admission/${value}${tab ? `?tab=${tab}` : ''}`;
};

/** Id of an admission from any shape the API may return. */
export const admissionIdOf = (row) => row?._id || row?.admissionId || row?.admission?._id || null;

export default admissionPath;
