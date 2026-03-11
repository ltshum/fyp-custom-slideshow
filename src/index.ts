import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PLUGIN_ID } from './constants';
import pluginMain from './plugin';
import mjPlugin from './mathjax4/plugin';

/**
 * Initialization data for the custom-slideshow extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: `${PLUGIN_ID}:plugin`,
  description: 'JupyterLab extension for animated slideshow.',
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    nbTracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) => {
    console.log('JupyterLab extension custom-slideshow is activated!');
    pluginMain(app, nbTracker, settingRegistry);
    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('custom-slideshow settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for custom-slideshow.',
            reason
          );
        });
    }
  }
};

export default [plugin, mjPlugin];
