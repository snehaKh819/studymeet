import { LANGUAGES } from './languages.js';

// Makes sure each language's image exists locally (pulls it on first start).
// state[language] = 'checking' | 'pulling' | 'ready' | 'error'
export function createImageManager(docker, languages = LANGUAGES, log = console) {
  const state = Object.fromEntries(Object.keys(languages).map((k) => [k, 'checking']));

  const exists = async (image) => (await docker.request('GET', `/images/${encodeURIComponent(image)}/json`)).status === 200;

  async function pull(image) {
    const [name, tag = 'latest'] = image.split(':');
    const res = await docker.open('POST', `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
    let text = '';
    for await (const chunk of res) text += chunk.toString('utf8');
    if (res.statusCode !== 200 || /"error"/.test(text)) throw new Error(`pull failed (HTTP ${res.statusCode})`);
  }

  async function ensure(language) {
    const { image } = languages[language];
    try {
      if (!(await exists(image))) {
        state[language] = 'pulling';
        log.log(`Pulling ${image} ...`);
        await pull(image);
      }
      state[language] = (await exists(image)) ? 'ready' : 'error';
    } catch (err) {
      state[language] = 'error';
      log.error(`Image ${image}: ${err.message}`);
    }
  }

  const refresh = () => Promise.all(Object.keys(languages).filter((l) => state[l] !== 'ready' && state[l] !== 'pulling').map(ensure));

  return {
    state,
    start() {
      refresh();
      const t = setInterval(refresh, 60_000); // retry failures
      t.unref();
    },
    refresh,
  };
}
