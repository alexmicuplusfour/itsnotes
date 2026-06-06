/**
 * Global registry for NoteForm's save function
 * This allows NavigationBridge to trigger saves before navigation
 */

const noteFormSaveRegistry = {
  current: null,

  register(saveFunction) {
    console.log('[SaveRegistry] Registering save function');
    this.current = saveFunction;
  },

  unregister() {
    console.log('[SaveRegistry] Unregistering save function');
    this.current = null;
  },

  async save(options = {}) {
    if (this.current) {
      console.log('[SaveRegistry] Calling registered save function');
      return await this.current(options);
    } else {
      console.log('[SaveRegistry] No save function registered');
      return null;
    }
  }
};

export default noteFormSaveRegistry;
