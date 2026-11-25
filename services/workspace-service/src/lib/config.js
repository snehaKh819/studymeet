export const SHARING_MODES = ['PRIVATE', 'VIEW_ONLY', 'COLLABORATIVE'];

// Languages the editor can select. Add 'cpp' / 'java' here once the
// execution service supports them.
export const LANGUAGES = ['python', 'javascript'];

export const MAX_CODE_LENGTH = 200_000;
export const MAX_NAME_LENGTH = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
