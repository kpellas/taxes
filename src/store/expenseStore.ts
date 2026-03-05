import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  account: string;
  categoryId: string;
  entityId: string;
  isTaxDeductible: boolean;
  financialYear: string;
  notes?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: 'business_income' | 'business_expense' | 'personal_deduction';
  isTaxDeductible: boolean;
}

// Pre-defined categories
export const defaultCategories: ExpenseCategory[] = [
  // Business (M2K2 Trust)
  { id: 'biz-revenue', name: 'Consulting Revenue', type: 'business_income', isTaxDeductible: false },
  { id: 'biz-contractor', name: 'Contractor Payments', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-tools', name: 'Tools & Equipment', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-vehicle', name: 'Vehicle / Travel', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-office', name: 'Office / Admin', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-insurance', name: 'Business Insurance', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-professional', name: 'Professional Fees', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-software', name: 'Software / Subscriptions', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-depreciation', name: 'Depreciation', type: 'business_expense', isTaxDeductible: true },
  { id: 'biz-other', name: 'Other Business Expense', type: 'business_expense', isTaxDeductible: true },

  // Personal deductions (Kelly & Mark)
  { id: 'pers-work', name: 'Work-Related Expenses', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-car', name: 'Car & Travel', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-clothing', name: 'Clothing / Uniforms', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-education', name: 'Self-Education', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-wfh', name: 'Working From Home', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-tools', name: 'Tools & Equipment', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-union', name: 'Union / Professional Fees', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-donations', name: 'Donations', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-income-protection', name: 'Income Protection Insurance', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-tax-agent', name: 'Tax Agent Fees', type: 'personal_deduction', isTaxDeductible: true },
  { id: 'pers-other', name: 'Other Deductions', type: 'personal_deduction', isTaxDeductible: true },
];

interface ExpenseState {
  expenses: Expense[];
  categories: ExpenseCategory[];

  addExpense: (expense: Omit<Expense, 'id'>) => void;
  addExpenses: (expenses: Omit<Expense, 'id'>[]) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  getExpensesByEntity: (entityId: string) => Expense[];
  getExpensesByFY: (fy: string) => Expense[];
  addCategory: (category: Omit<ExpenseCategory, 'id'>) => void;
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      expenses: [],
      categories: defaultCategories,

      addExpense: (expense) =>
        set((state) => ({
          expenses: [
            ...state.expenses,
            { ...expense, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) },
          ],
        })),

      addExpenses: (newExpenses) =>
        set((state) => ({
          expenses: [
            ...state.expenses,
            ...newExpenses.map((e) => ({
              ...e,
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + Math.random().toString(36).slice(2, 5),
            })),
          ],
        })),

      updateExpense: (id, updates) =>
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      deleteExpense: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),

      getExpensesByEntity: (entityId) =>
        get().expenses.filter((e) => e.entityId === entityId),

      getExpensesByFY: (fy) =>
        get().expenses.filter((e) => e.financialYear === fy),

      addCategory: (category) =>
        set((state) => ({
          categories: [
            ...state.categories,
            { ...category, id: 'cat-' + Date.now().toString(36) },
          ],
        })),
    }),
    { name: 'expense-store' }
  )
);
