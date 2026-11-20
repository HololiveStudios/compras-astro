import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    console.log(`SW registrado em: ${swUrl}`);
  },
  onRegisterError(error) {
    console.error('Erro ao registrar SW', error);
  },
});