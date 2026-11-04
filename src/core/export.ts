// SPDX-License-Identifier: AGPL-3.0-or-later
// Binary STL and 3MF writers. 3MF keeps each part as a separate body for multi-colour printing.
import { strToU8, zipSync } from 'fflate';
import { mergeMeshes, type Part, type TriMesh } from './mesh';

export function toSTL(mesh: TriMesh, header = 'Extruda'): Uint8Array {
  const tris = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const out = new Uint8Array(buf);
  out.set(strToU8(header.slice(0, 80)));
  const dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  const p = mesh.positions;
  const ix = mesh.indices;
  let o = 84;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(o, p[v], true); dv.setFloat32(o + 4, p[v + 1], true); dv.setFloat32(o + 8, p[v + 2], true);
      o += 12;
    }
    o += 2; // attribute byte count
  }
  return out;
}

export function partsToSTL(parts: Part[], header?: string): Uint8Array {
  return toSTL(mergeMeshes(parts.map((p) => p.mesh)), header);
}

/** Wavefront OBJ text. */
export function toOBJ(mesh: TriMesh, name = 'Extruda'): string {
  const lines = [`# ${name}`, 'o model'];
  const p = mesh.positions, ix = mesh.indices;
  for (let i = 0; i < p.length; i += 3) lines.push(`v ${num(p[i])} ${num(p[i + 1])} ${num(p[i + 2])}`);
  for (let t = 0; t < ix.length; t += 3) lines.push(`f ${ix[t] + 1} ${ix[t + 1] + 1} ${ix[t + 2] + 1}`);
  return `${lines.join('\n')}\n`;
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => (Math.round(n * 1e5) / 1e5).toString();

export interface ModelObject {
  name: string;
  parts: Part[];
}

/** One object made of several parts, which slicers such as Bambu Studio and PrusaSlicer load as a multi-part model. */
export function to3MF(parts: Part[], title = 'Extruda model'): Uint8Array {
  return objectsTo3MF([{ name: title, parts }], title);
}

/** Several independent objects (e.g. a full build plate), each made of one or more coloured parts. */
export function objectsTo3MF(models: ModelObject[], title = 'Extruda model'): Uint8Array {
  const allParts = models.flatMap((o) => o.parts);
  const materialsId = 1;
  let nextId = 2;
  let partIndex = 0;
  const resources: string[] = [];
  const items: string[] = [];
  for (const model of models) {
    const components: string[] = [];
    for (const part of model.parts) {
      const id = nextId++;
      const p = part.mesh.positions;
      const ix = part.mesh.indices;
      const verts: string[] = [];
      for (let v = 0; v < p.length; v += 3) verts.push(`<vertex x="${num(p[v])}" y="${num(p[v + 1])}" z="${num(p[v + 2])}"/>`);
      const tris: string[] = [];
      for (let t = 0; t < ix.length; t += 3) tris.push(`<triangle v1="${ix[t]}" v2="${ix[t + 1]}" v3="${ix[t + 2]}"/>`);
      resources.push(
        `<object id="${id}" name="${xmlEscape(part.name)}" type="model" pid="${materialsId}" pindex="${partIndex++}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`,
      );
      components.push(`<component objectid="${id}"/>`);
    }
    const assemblyId = nextId++;
    resources.push(`<object id="${assemblyId}" name="${xmlEscape(model.name)}" type="model"><components>${components.join('')}</components></object>`);
    items.push(`<item objectid="${assemblyId}"/>`);
  }
  const materials = allParts
    .map((part) => `<base name="${xmlEscape(part.name)}" displaycolor="${part.color.toUpperCase()}FF"/>`)
    .join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${xmlEscape(title)}</metadata>
<metadata name="Application">Extruda</metadata>
<resources>
<basematerials id="${materialsId}">${materials}</basematerials>
${resources.join('\n')}
</resources>
<build>${items.join('')}</build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
}

export function zipFiles(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 });
}

/** Turns user text into a safe file name, keeping Cyrillic letters. */
export function fileSafe(s: string, fallback = 'model'): string {
  const cleaned = s.trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return cleaned || fallback;
}

export function download(data: Uint8Array | string, filename: string, mime = 'application/octet-stream'): void {
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
