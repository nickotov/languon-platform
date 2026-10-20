import type { DocScenario } from '../types/document';

export const docScenarios: DocScenario[] = [
  { id: 'new', label: '1 · Новый пустой документ', group: 'Документ' },
  { id: 'saved-edits', label: '2 · Сохранён, есть правки', group: 'Документ' },
  { id: 'chat-closed', label: 'Фокус — без репетитора', group: 'Раскладка' },
  { id: 'chat-focus', label: 'Чат — 60% ширины', group: 'Раскладка' },
  { id: 'narrow', label: 'Компактный десктоп · 1100 px', group: 'Раскладка', viewport: 'narrow' },
  { id: 'tablet', label: 'Планшет · 900 px, панель поверх', group: 'Раскладка', viewport: 'tablet' },
  { id: 'inline-correct', label: '3 · Исправление прямо в тексте', group: 'Репетитор' },
  { id: 'proposal-changed', label: '3b · Фрагмент изменился → сравнить', group: 'Репетитор' },
  { id: 'proposal', label: 'Добавить ответ в документ', group: 'Репетитор' },
  { id: 'streaming', label: 'Ответ печатается', group: 'Репетитор' },
  { id: 'stopped', label: 'Ответ остановлен', group: 'Репетитор' },
  { id: 'limits', label: 'Ограничения объёма', group: 'Репетитор' },
  { id: 'conflict', label: '4 · Правки с двух устройств', group: 'Состояния' },
  { id: 'history', label: '5 · История версий', group: 'Состояния' },
  { id: 'loading', label: 'Загрузка документа', group: 'Состояния' },
  { id: 'load-error', label: 'Документ не открылся', group: 'Состояния' },
  { id: 'mobile-doc', label: 'Мобильный · документ', group: 'Мобильный', viewport: 'mobile' },
  { id: 'mobile-tutor', label: 'Мобильный · репетитор', group: 'Мобильный', viewport: 'mobile' },
  { id: 'dark', label: 'Тёмная тема', group: 'Тема', dark: true },
];

