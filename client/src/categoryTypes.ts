export interface Category {
  CategoryID: number;
  Name: string;
  Description: string;
  DepartmentID: number;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsActive: boolean;
  CreatedByName?: string;
  DepartmentName?: string;
}

export interface CategoryInformation {
  InformationID: number;
  CategoryID: number;
  Title: string;
  Content: string;
  OrderIndex: number;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsActive: boolean;
  CreatedByName?: string;
}

export interface CategoriesResponse {
  Categories: Category[];
  Count: number;
}