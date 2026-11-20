import type { Component } from 'solid-js';
import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { db, app } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import CategoryDropdown from './CategoryDropdown'; 
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';

interface Item {
  id: number;
  name: string;
  category: string;
  quantity: string;
  value: number;
  location?: string;
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
  notes?: string;
}

type ShoppingLists = Record<string, Item[]>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (value: number): string => {
  if (!Number.isFinite(value)) return currencyFormatter.format(0);
  return currencyFormatter.format(value);
};

const months = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const categories = [
  { name: 'Alimentação', emoji: '🍽️', color: 'from-orange-500 to-red-500' },
  { name: 'Limpeza', emoji: '🧹', color: 'from-blue-500 to-cyan-500' },
  { name: 'Higiene', emoji: '🧴', color: 'from-pink-500 to-rose-500' },
  { name: 'Bebidas', emoji: '🥤', color: 'from-purple-500 to-indigo-500' },
  { name: 'Frutas', emoji: '🍎', color: 'from-green-500 to-emerald-500' },
  { name: 'Carnes', emoji: '🥩', color: 'from-red-600 to-rose-600' },
  { name: 'Laticínios', emoji: '🥛', color: 'from-yellow-400 to-amber-400' },
  { name: 'Outros', emoji: '📦', color: 'from-gray-500 to-slate-500' },
];

const priorityConfig = {
  high: { label: 'Alta', color: 'bg-red-100 text-red-700 border-red-200', emoji: '🔴' },
  medium: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', emoji: '🟡' },
  low: { label: 'Baixa', color: 'bg-green-100 text-green-700 border-green-200', emoji: '🟢' },
};

const getMonthKey = (month: number, year: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

const ShoppingListSolid: Component = () => {
  // Auth
  const [user, setUser] = createSignal<User | null>(null);
  const [authReady, setAuthReady] = createSignal(false);
  const [showUserMenu, setShowUserMenu] = createSignal(false);

  // Estado principal
  const [currentMonth, setCurrentMonth] = createSignal(new Date().getMonth());
  const [currentYear, setCurrentYear] = createSignal(new Date().getFullYear());
  const [shoppingLists, setShoppingLists] = createStore<ShoppingLists>({});
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [filterCategory, setFilterCategory] = createSignal<string>('all');
  const [sortBy, setSortBy] = createSignal<'name' | 'value' | 'category'>('category');

  type FormItem = Omit<Item, 'id'>;

  const [isFormOpen, setIsFormOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [formItem, setFormItem] = createSignal<FormItem>({
    name: '',
    category: 'Alimentação',
    quantity: '1',
    value: 0,
    location: '',
    completed: false,
    priority: 'medium',
    notes: '',
  });

  const currentMonthKey = createMemo(() =>
    getMonthKey(currentMonth(), currentYear())
  );

  const currentList = createMemo<Item[]>(() => {
    return shoppingLists[currentMonthKey()] ?? [];
  });

  const filteredList = createMemo(() => {
    let list = currentList();
    
    // Filtro de busca
    const query = searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query)
      );
    }

    // Filtro de categoria
    if (filterCategory() !== 'all') {
      list = list.filter(item => item.category === filterCategory());
    }

    // Ordenação
    const sort = sortBy();
    if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'value') {
      list = [...list].sort((a, b) => b.value - a.value);
    }

    return list;
  });

  const monthLabel = createMemo(
    () => `${months[currentMonth()]} ${currentYear()}`
  );

  const groupedItems = createMemo<Record<string, Item[]>>(() => {
    const list = filteredList();
    const groups: Record<string, Item[]> = {};
    for (const item of list) {
      const cat = item.category || 'Outros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  });

  const totalValue = createMemo(() =>
    currentList().reduce((total, item) => total + (item.value || 0), 0)
  );

  const completedValue = createMemo(() =>
    currentList()
      .filter(item => item.completed)
      .reduce((total, item) => total + (item.value || 0), 0)
  );

  const remainingValue = createMemo(() => totalValue() - completedValue());

  const completedCount = createMemo(
    () => currentList().filter((item) => item.completed).length
  );

  const progressPercentage = createMemo(() => {
    const total = currentList().length;
    if (total === 0) return 0;
    return Math.round((completedCount() / total) * 100);
  });

  const getCategoryColor = (categoryName: string) => {
    const cat = categories.find(c => c.name === categoryName);
    return cat?.color || 'from-gray-500 to-slate-500';
  };

  const getCategoryEmoji = (categoryName: string) => {
    const cat = categories.find(c => c.name === categoryName);
    return cat?.emoji || '📦';
  };

  const saveList = async (list: Item[]) => {
    const key = currentMonthKey();
    const currentUser = user();
    const localKey = `shoppingList-${key}`;

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(localKey, JSON.stringify(list));
      }

      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid, 'shoppingLists', key);
        await setDoc(docRef, {
          items: list,
          lastUpdated: new Date().toISOString(),
          month: currentMonth(),
          year: currentYear(),
        });
      }
    } catch (error) {
      console.error('Erro ao salvar lista:', error);
    }
  };

  // Auth listener
  onMount(() => {
    const auth = getAuth(app);
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    onCleanup(() => unsub());
  });

  // Carregar lista quando mês ou usuário mudam
  createEffect(() => {
    const key = currentMonthKey();
    const currentUser = user();

    if (typeof window === 'undefined') return;

    const localKey = `shoppingList-${key}`;

    (async () => {
      setLoading(true);
      try {
        if (currentUser) {
          const docRef = doc(db, 'users', currentUser.uid, 'shoppingLists', key);
          const snap = await getDoc(docRef);

          if (snap.exists()) {
            const data = snap.data();
            const items = Array.isArray(data?.items)
              ? (data.items as Item[])
              : [];
            setShoppingLists(key, items);
          } else {
            const stored = window.localStorage.getItem(localKey);
            const items = stored ? (JSON.parse(stored) as Item[]) : [];
            setShoppingLists(key, items);
          }
        } else {
          const stored = window.localStorage.getItem(localKey);
          const items = stored ? (JSON.parse(stored) as Item[]) : [];
          setShoppingLists(key, items);
        }
      } catch (error) {
        console.error('Erro ao carregar lista:', error);
        setShoppingLists(key, []);
      } finally {
        setLoading(false);
      }
    })();
  });

  const handleOpenNew = () => {
    setEditingId(null);
    setFormItem({
      name: '',
      category: 'Alimentação',
      quantity: '1',
      value: 0,
      location: '',
      completed: false,
      priority: 'medium',
      notes: '',
    });
    setIsFormOpen(true);
  };

  const handleEditRequest = (item: Item) => {
    setEditingId(item.id);
    setFormItem({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      value: item.value,
      location: item.location ?? '',
      completed: item.completed,
      priority: item.priority ?? 'medium',
      notes: item.notes ?? '',
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = async () => {
    const data = formItem();
    if (!data.name.trim()) return;

    const key = currentMonthKey();
    const list = currentList();

    if (editingId() === null) {
      const newItem: Item = {
        id: Date.now(),
        ...data,
      };
      const updated = [...list, newItem];
      setShoppingLists(key, updated);
      await saveList(updated);
    } else {
      const id = editingId()!;
      const updated = list.map((item) =>
        item.id === id ? { ...item, ...data } : item
      );
      setShoppingLists(key, updated);
      await saveList(updated);
    }

    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleToggleComplete = async (id: number) => {
    const key = currentMonthKey();
    const list = currentList();
    const updated = list.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    setShoppingLists(key, updated);
    await saveList(updated);
  };

  const handleDeleteItem = async (id: number) => {
    const key = currentMonthKey();
    const list = currentList();
    const updated = list.filter((item) => item.id !== id);
    setShoppingLists(key, updated);
    await saveList(updated);
  };

  const handleClearCompleted = async () => {
    const key = currentMonthKey();
    const list = currentList();
    const updated = list.filter(item => !item.completed);
    setShoppingLists(key, updated);
    await saveList(updated);
  };

  const navigateMonth = (direction: 'next' | 'prev') => {
    setCurrentMonth((prev) => {
      let newMonth = prev;
      let newYear = currentYear();

      if (direction === 'next') {
        if (prev === 11) {
          newMonth = 0;
          newYear = currentYear() + 1;
        } else {
          newMonth = prev + 1;
        }
      } else {
        if (prev === 0) {
          newMonth = 11;
          newYear = currentYear() - 1;
        } else {
          newMonth = prev - 1;
        }
      }

      if (newYear !== currentYear()) {
        setCurrentYear(newYear);
      }
      return newMonth;
    });
  };

  const loginWithGoogle = async () => {
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = async () => {
    const auth = getAuth(app);
    await signOut(auth);
    setShowUserMenu(false);
  };

  // Adicione junto com seus outros signals
const [isSortOpen, setIsSortOpen] = createSignal(false);

// Opções de ordenação (para facilitar o loop)
const sortOptions = [
  { value: 'category', label: 'Categoria' },
  { value: 'name', label: 'Nome' },
  { value: 'value', label: 'Valor' }
];

// Helper para mostrar o texto bonito no botão
const currentSortLabel = () => {
  const found = sortOptions.find(o => o.value === sortBy());
  return found ? found.label : 'Categoria';
};

  return (
    <div class="min-h-screen flex flex-col">
      {/* Header fixo */}
      <header class="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b border-purple-100/50">
                {/* Barra de progresso */}
          <Show when={currentList().length > 0}>
              <div class="h-2 bg-purple-100 overflow-hidden">
                <div
                  class="h-full bg-purple-600 transition-colors"
                  style={`width: ${progressPercentage()}%`}
                />
              </div>
          </Show>
        <div class="max-w-md mx-auto px-4 py-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center shadow-sm">
                <span class="text-xl">🛒</span>
              </div>
              <div>
                <h1 class="text-base font-bold text-purple-900 leading-tight">
                  Lista de Compras
                </h1>
                <p class="text-[10px] text-purple-600 font-medium">{monthLabel()}</p>
              </div>
            </div>

            <Show when={user()}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu())}
                class="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
              >
                {user()?.email?.charAt(0).toUpperCase()}
              </button>
            </Show>
          </div>

          {/* Menu do usuário */}
          <Show when={showUserMenu()}>
            <div class="absolute right-4 top-14 bg-white rounded-2xl shadow-sm light-border border-purple-100 p-3 min-w-[200px] z-50">
              <div class="text-xs text-purple-900 font-medium mb-1">
                {user()?.email}
              </div>
              <div class="text-[10px] text-purple-600 mb-3">
                Sincronizado
              </div>
              <button
                type="button"
                onClick={handleLogout}
                class="w-full py-2 text-xs rounded-lg bg-gray-50 text-red-700 light-border border-red-200 font-medium active:scale-95 transition-transform"
              >
                Sair
              </button>
            </div>
          </Show>


        </div>
      </header>

      {/* Conteúdo principal */}
      <div class="flex-1 w-full pt-[120px] pb-[180px]">
        <div class="max-w-md mx-auto px-4">
          <Show when={!loading()} fallback={
            <div class="flex items-center justify-center h-[50vh]">
              <div class="flex flex-col items-center gap-3">
                <div class="w-12 h-12 rounded-full border-3 border-purple-400 border-t-transparent animate-spin" />
                <span class="text-sm text-purple-700 font-medium spinner">
                  Carregando suas listas...
                </span>
              </div>
            </div>
          }>
            {/* Login prompt */}
            <Show when={authReady() && !user() && currentList().length === 0}>
              <div class="mt-6">
                <div class="bg-white rounded-3xl shadow-sm px-6 py-8 light-border border-purple-200">
                  <div class="w-16 h-16 mx-auto rounded-full bg-purple-600 flex items-center justify-center mb-4 shadow-sm">
                    <span class="text-3xl">👋</span>
                  </div>
                  <h2 class="text-xl font-bold text-purple-900 mb-2 text-center">
                    Bem-vindo!
                  </h2>
                  <p class="text-sm text-purple-700 mb-6 text-center leading-relaxed">
                    Entre com sua conta Google para sincronizar suas listas em todos os dispositivos
                  </p>
                  <button
                    type="button"
                    onClick={loginWithGoogle}
                    class="w-full py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white shadow-sm active:scale-95 transition-transform btn-ripple"
                  >
                    Entrar com Google
                  </button>
                  <p class="text-xs text-purple-600 mt-4 text-center">
                    Ou comece offline - salvamos no seu dispositivo
                  </p>
                </div>
              </div>
            </Show>

{/* FILTROS CONTAINER */}
<Show when={currentList().length > 0}>
  <div class="mb-4 flex flex-col gap-3">

    {/* BUSCA (Mantive igual, ocupando largura total) */}
    <div class="relative w-full">
      <input
        type="text"
        value={searchQuery()}
        onInput={(e) => setSearchQuery(e.currentTarget.value)}
        placeholder="Buscar itens..."
        class="w-full h-11 pl-10 pr-10 rounded-xl bg-white/70 light-border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
      />
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400">🔍</span>
      <Show when={searchQuery()}>
        <button onClick={() => setSearchQuery('')} class="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 p-1">✕</button>
      </Show>
    </div>

    {/* GRID 50/50 PARA OS FILTROS */}
    <div class="grid grid-cols-2 gap-3">

{/* 1. ORDENAR (Versão Customizada - Igual ao Categoria) */}
<div class="relative w-full">
  <button
    type="button"
    onClick={() => setIsSortOpen(!isSortOpen())}
    class="w-full h-11 px-3 flex items-center justify-between rounded-xl bg-white/70 light-border border-purple-200 text-xs sm:text-sm text-purple-700 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm transition-colors"
  >
    <span class="truncate">
      Ord: {currentSortLabel()}
    </span>
    
    {/* Seta animada */}
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      class={`h-4 w-4 text-purple-500 transition-transform duration-200 ${isSortOpen() ? 'rotate-180' : ''}`} 
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {/* O Menu Flutuante */}
  <Show when={isSortOpen()}>
    <div class="absolute left-0 mt-1 w-full min-w-[120px] rounded-xl light-border border-purple-200 shadow-sm p-1 z-50 backdrop-blur-md bg-white/95">
      <For each={sortOptions}>
        {(option) => (
          <button
            class={`block w-full text-left px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors flex items-center justify-between ${
              sortBy() === option.value 
                ? 'bg-purple-100 text-purple-900 font-bold' 
                : 'text-purple-700 hover:bg-gray-50'
            }`}
            onClick={() => {
              setSortBy(option.value as any);
              setIsSortOpen(false);
            }}
          >
            <span>Ord: {option.label}</span>
            
            {/* Checkzinho visual se estiver selecionado */}
            <Show when={sortBy() === option.value}>
              <span class="text-purple-500">✓</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  </Show>
</div>

      {/* 2. CATEGORIA (Direita) */}
      {/* O componente precisa ocupar 100% da célula do grid */}
      <div class="w-full relative"> 
        <CategoryDropdown
          categories={categories}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
        />
      </div>

    </div>
  </div>
</Show>

            {/* Lista vazia */}
            <Show when={currentList().length === 0 && (user() || !authReady())}>
              <div class="flex flex-col items-center justify-center h-[50vh] text-center px-6">
                <div class="w-20 h-20 rounded-3xl bg-white shadow-sm light-border border-purple-200 flex items-center justify-center mb-4">
                  <span class="text-4xl">📝</span>
                </div>
                <h3 class="text-lg font-bold text-purple-900 mb-2">
                  Nenhum item ainda
                </h3>
                <p class="text-sm text-purple-600 mb-6">
                  Comece adicionando itens à sua lista de compras
                </p>
                <button
                  type="button"
                  onClick={handleOpenNew}
                  class="px-6 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold shadow-sm active:scale-95 transition-transform btn-ripple"
                >
                  + Adicionar Primeiro Item
                </button>
              </div>
            </Show>

            {/* Lista com itens */}
            <Show when={filteredList().length > 0}>
              <div class="space-y-4">
                <For each={Object.entries(groupedItems())}>
                  {([category, items]) => (
                    <section class="category-enter">
                      <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                          <div class={`w-8 h-8 rounded-xl bg-gradient-to-br ${getCategoryColor(category)} flex items-center justify-center shadow-sm`}>
                            <span class="text-base">{getCategoryEmoji(category)}</span>
                          </div>
                          <div>
                            <div class="text-sm font-bold text-purple-900">
                              {category}
                            </div>
                            <div class="text-[10px] text-purple-600">
                              {items.length} {items.length === 1 ? 'item' : 'itens'}
                            </div>
                          </div>
                        </div>
                        <div class="text-xs font-bold text-purple-700">
                          {formatCurrency(items.reduce((sum, item) => sum + item.value, 0))}
                        </div>
                      </div>
                      <div class="space-y-2">
                        <For each={items}>
                          {(item) => (
                            <div class="item-enter bg-white rounded-2xl shadow-sm light-border border-purple-100 p-4">
                              <div class="flex gap-3">

                                <div class="flex-1 min-w-0">
                                  <div class="flex items-start justify-between gap-2 mb-2">
                                    <h4
                                      class={`text-sm font-bold ${
                                        item.completed
                                          ? 'line-through text-gray-400'
                                          : 'text-gray-900'
                                      }`}
                                    >
                                      {item.name}
                                    </h4>
                                                                        <span class="text-[10px] px-2 py-1 rounded-lg bg-gray-50 text-purple-700 light-border border-purple-200 font-medium">
                                      Qtd: {item.quantity}
                                    </span>
                                    <span class="text-sm font-bold text-purple-700 whitespace-nowrap">
                                      {formatCurrency(item.value)}
                                    </span>
                                                                    <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={() => handleToggleComplete(item.id)}
                                  class="mt-0.5 accent-purple-600 flex-shrink-0"
                                />
                                  </div>

                                  <div class="flex flex-wrap gap-1.5 mb-2">

                                    
                                    <Show when={item.location}>
                                      <span class="text-[10px] px-2 py-1 rounded-lg bg-gray-50 text-blue-700 light-border border-blue-200 font-medium">
                                        📍 {item.location}
                                      </span>
                                    </Show>
                                    <Show when={item.priority && item.priority !== 'medium'}>
                                      <span class={`text-[10px] px-2 py-1 rounded-lg light-border font-medium ${priorityConfig[item.priority!].color}`}>
                                        {priorityConfig[item.priority!].emoji} {priorityConfig[item.priority!].label}
                                      </span>
                                    </Show>
                                  </div>

                                  <Show when={item.notes}>
                                    <p class="text-xs text-gray-600 mb-2 italic">
                                      💭 {item.notes}
                                    </p>
                                  </Show>

                                  <div class="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditRequest(item)}
                                      class="flex-1 text-xs px-3 py-1.5 rounded-lg light-border border-blue-200 text-blue-700 bg-gray-50 font-medium active:scale-95 transition-transform"
                                    >
                                      ✏️ Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(item.id)}
                                      class="flex-1 text-xs px-3 py-1.5 rounded-lg light-border border-red-200 text-red-700 bg-gray-50 font-medium active:scale-95 transition-transform"
                                    >
                                      🗑️ Excluir
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>

            {/* Sem resultados na busca */}
            <Show when={currentList().length > 0 && filteredList().length === 0}>
              <div class="flex flex-col items-center justify-center h-[40vh] text-center px-6">
                <span class="text-6xl mb-4">🔍</span>
                <h3 class="text-lg font-bold text-purple-900 mb-2">
                  Nenhum resultado
                </h3>
                <p class="text-sm text-purple-600">
                  Tente ajustar os filtros ou busca
                </p>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      {/* Barra inferior fixa */}
      <nav class="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-purple-200 shadow-sm">
        <div class="max-w-md mx-auto px-4 py-3">


          {/* Estatísticas */}
          <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="bg-white rounded-xl p-2 light-border border-purple-100 text-center">
              <div class="text-[10px] text-purple-600 mb-0.5">Total</div>
              <div class="text-xs font-bold text-purple-900">
                {formatCurrency(totalValue())}
              </div>
            </div>
            <div class="bg-white rounded-xl p-2 light-border border-green-100 text-center">
              <div class="text-[10px] text-green-600 mb-0.5">Comprado</div>
              <div class="text-xs font-bold text-green-700">
                {formatCurrency(completedValue())}
              </div>
            </div>
            <div class="bg-white rounded-xl p-2 light-border border-pink-100 text-center">
              <div class="text-[10px] text-pink-600 mb-0.5">Restante</div>
              <div class="text-xs font-bold text-pink-700">
                {formatCurrency(remainingValue())}
              </div>
            </div>
          </div>

<div class="flex items-center w-full gap-2">

  {/* Prev no canto esquerdo */}
  <button
    type="button"
    onClick={() => navigateMonth('prev')}
    class="w-12 h-10 rounded-full bg-white border border-purple-200 flex items-center justify-center text-purple-700 font-bold shadow-sm active:scale-95"
  >
    ‹
  </button>

  {/* Centro ocupa o espaço restante automaticamente */}
  <div class="flex-1 text-center">
    <div class="text-sm font-bold text-purple-900">{monthLabel()}</div>
    <div class="text-[10px] text-purple-600">
      {currentList().length} {currentList().length === 1 ? 'item' : 'itens'}
    </div>
  </div>

  {/* Próximo mês */}
  <button
    type="button"
    onClick={() => navigateMonth('next')}
    class="w-12 h-10 rounded-full bg-white border border-purple-200 flex items-center justify-center text-purple-700 font-bold shadow-sm active:scale-95"
  >
    ›
  </button>

  {/* Botão maior, no canto direito, sem espremer nada */}
  <button
    type="button"
    onClick={handleOpenNew}
    class="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold shadow-sm active:scale-95 transition-transform btn-ripple"
  >
    +
  </button>

</div>

        </div>
      </nav>

      {/* Modal de formulário */}
      <Show when={isFormOpen()}>
        <div 
          class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setIsFormOpen(false)}
        >
          <div 
            class="w-full max-w-md mx-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-sm border-t border-purple-100 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div class="sticky top-0 bg-white border-b border-purple-100 px-5 py-4 flex items-center justify-between">
              <h2 class="text-base font-bold text-purple-900">
                {editingId() === null ? '➕ Novo Item' : '✏️ Editar Item'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                class="w-8 h-8 rounded-full bg-white light-border border-purple-200 flex items-center justify-center text-purple-700 active:scale-95 transition-transform"
              >
                ✕
              </button>
            </div>

            {/* Formulário */}
            <div class="p-5 space-y-4">
              <div>
                <label class="block text-xs font-semibold text-purple-900 mb-2">
                  Nome do Item *
                </label>
                <input
                  type="text"
                  value={formItem().name}
                  onInput={(e) =>
                    setFormItem({ ...formItem(), name: e.currentTarget.value })
                  }
                  class="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Ex: Arroz, Feijão, Maçã..."
                  autofocus
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-purple-900 mb-2">
                  Categoria
                </label>
                <div class="grid grid-cols-4 gap-2">
                  <For each={categories}>
                    {(cat) => (
                      <button
                        type="button"
                        onClick={() => setFormItem({ ...formItem(), category: cat.name })}
                        class={`p-3 rounded-xl border-2 transition-colors ${
                          formItem().category === cat.name
                            ? 'border-purple-500 bg-gray-50 shadow-sm scale-105'
                            : 'border-purple-200 bg-white'
                        }`}
                      >
                        <div class="text-2xl mb-1">{cat.emoji}</div>
                        <div class="text-[9px] font-medium text-purple-900">
                          {cat.name}
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-purple-900 mb-2">
                    Quantidade
                  </label>
                  <input
                    type="text"
                    value={formItem().quantity}
                    onInput={(e) =>
                      setFormItem({ ...formItem(), quantity: e.currentTarget.value })
                    }
                    class="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Ex: 1kg, 2L"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-purple-900 mb-2">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    value={formItem().value}
                    onInput={(e) =>
                      setFormItem({
                        ...formItem(),
                        value: parseFloat(e.currentTarget.value || '0'),
                      })
                    }
                    class="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-purple-900 mb-2">
                  Local (opcional)
                </label>
                <input
                  type="text"
                  value={formItem().location}
                  onInput={(e) =>
                    setFormItem({ ...formItem(), location: e.currentTarget.value })
                  }
                  class="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Ex: Supermercado, Farmácia..."
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-purple-900 mb-2">
                  Prioridade
                </label>
                <div class="flex gap-2">
                  <For each={Object.entries(priorityConfig)}>
                    {([key, config]) => (
                      <button
                        type="button"
                        onClick={() => setFormItem({ ...formItem(), priority: key as any })}
                        class={`flex-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-colors ${
                          formItem().priority === key
                            ? 'border-purple-500 bg-gray-50 shadow-sm scale-105'
                            : `border-transparent ${config.color}`
                        }`}
                      >
                        {config.emoji} {config.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-purple-900 mb-2">
                  Observações (opcional)
                </label>
                <textarea
                  value={formItem().notes}
                  onInput={(e) =>
                    setFormItem({ ...formItem(), notes: e.currentTarget.value })
                  }
                  class="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder="Adicione observações sobre o item..."
                  rows="3"
                />
              </div>

              <div class="flex items-center gap-3 bg-white rounded-xl p-3 light-border border-purple-200">
                <input
                  id="completed-form"
                  type="checkbox"
                  checked={formItem().completed}
                  onChange={(e) =>
                    setFormItem({ ...formItem(), completed: e.currentTarget.checked })
                  }
                  class="accent-purple-600"
                />
                <label
                  for="completed-form"
                  class="text-sm text-purple-900 font-medium select-none flex-1"
                >
                  ✅ Marcar como concluído
                </label>
              </div>

              <div class="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  class="flex-1 py-3 text-sm font-semibold border-2 border-purple-200 rounded-xl text-purple-700 bg-white active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmitForm}
                  disabled={!formItem().name.trim()}
                  class="flex-1 py-3 text-sm font-bold rounded-xl bg-purple-600 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform btn-ripple"
                >
                  {editingId() === null ? '➕ Adicionar' : '💾 Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ShoppingListSolid;