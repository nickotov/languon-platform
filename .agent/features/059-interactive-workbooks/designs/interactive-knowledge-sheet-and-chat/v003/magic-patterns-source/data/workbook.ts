export interface WorkbookSheet {
  id: string;
  title: string;
  completed: boolean;
}

/** The ordered workbook the demo sheet belongs to. A sheet belongs to at most one workbook. */
export const demoWorkbook = {
  name: 'Le français à la maison',
  currentId: 'wb-3',
  sheets: [
    { id: 'wb-1', title: 'Les pièces de la maison', completed: true },
    { id: 'wb-2', title: 'Les meubles et les objets', completed: true },
    { id: 'wb-3', title: 'Le ménage et les tâches', completed: false },
    { id: 'wb-4', title: 'Au marché', completed: false },
    { id: 'wb-5', title: 'Dans la cuisine', completed: false },
    { id: 'wb-6', title: 'Un week-end en famille — révision et conversation libre', completed: false },
  ] as WorkbookSheet[],
};

