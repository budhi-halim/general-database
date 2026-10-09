import { createDataViewer, fetchRecords } from '../assets/family/js/table-ui.js';
import { viewers } from './viewer-config.js';

const key = document.querySelector('[data-viewer]')?.dataset.viewer;
const config = viewers[key];
if (config) {
  createDataViewer({
    ...config, host: document.querySelector('#viewer'),
    load: signal => fetchRecords(`data/${config.source}`, signal, { envelope: key !== 'last-production' })
  });
}
