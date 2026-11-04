// SPDX-License-Identifier: AGPL-3.0-or-later
import { DESK } from './desk';
import { GIFTS } from './gifts';
import { HOME } from './home';
import { PARTS } from './parts';
import { PERSONAL } from './personal';
import type { Category, GalleryModel } from './types';

export const GALLERY: GalleryModel[] = [...PERSONAL, ...DESK, ...HOME, ...GIFTS, ...PARTS];

export const CATEGORIES: Category[] = ['desk', 'home', 'gifts', 'pets', 'holiday', 'parts'];

export function findModel(id: string): GalleryModel | undefined {
  return GALLERY.find((m) => m.id === id);
}
