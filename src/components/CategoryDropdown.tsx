import { createSignal, Show, For } from "solid-js";

interface Props {
  categories: { name: string; emoji: string }[];
  filterCategory: () => string;
  setFilterCategory: (v: string) => void;
}

export default function CategoryDropdown(props: Props) {
  const [open, setOpen] = createSignal(false);

  return (
    // 'w-full' aqui é essencial para obedecer o grid da tela principal
    <div class="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(!open())}
        // Classes atualizadas para igualar ao <select> vizinho:
        // h-11: Altura fixa de 44px
        // justify-between: Separa o texto da seta
        // bg-white/70: Fundo claro semi-transparente
        class="w-full h-11 px-3 flex items-center justify-between rounded-xl bg-white/70 border border-purple-200 text-xs sm:text-sm text-purple-700 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm transition-all"
      >
        <span class="truncate">
          {props.filterCategory() === "all" ? "Categoria" : props.filterCategory()}
        </span>
        
        {/* Ícone de seta SVG que gira quando abre */}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class={`h-4 w-4 text-purple-500 transition-transform duration-200 ${open() ? 'rotate-180' : ''}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={open()}>
        {/* Dropdown List: w-full para ter a mesma largura do botão */}
        <div class="absolute left-0 mt-1 w-full min-w-[140px] rounded-xl border border-purple-200 shadow-lg p-1 z-50 backdrop-blur-md bg-white/95">
          <button
            class="block w-full text-left px-3 py-2 text-xs sm:text-sm rounded-lg hover:bg-purple-100 transition-colors text-purple-800"
            onClick={() => {
              props.setFilterCategory("all");
              setOpen(false);
            }}
          >
            Todas
          </button>

          <For each={props.categories}>
            {(cat) => (
              <button
                class="block w-full text-left px-3 py-2 text-xs sm:text-sm rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-2 text-purple-800"
                onClick={() => {
                  props.setFilterCategory(cat.name);
                  setOpen(false);
                }}
              >
                <span>{cat.emoji}</span>
                <span class="truncate">{cat.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}