// SPDX-License-Identifier: AGPL-3.0-or-later
// Reference content for the guide page. Temperatures are typical ranges; the label on the spool wins.
export type Pair = readonly [string, string]; // [English, Български]

export interface MaterialGuide {
  name: string;
  nozzle: string;
  bed: string;
  enclosure: Pair;
  good: Pair;
  watch: Pair;
}

const NO: Pair = ['Not needed', 'Не е нужна'];
const HELPS: Pair = ['Helps', 'Помага'];
const YES: Pair = ['Needed', 'Нужна'];

export const MATERIAL_GUIDE: MaterialGuide[] = [
  {
    name: 'PLA',
    nozzle: '190–220 °C',
    bed: '45–60 °C',
    enclosure: NO,
    good: ['Decor, prototypes, gifts. The easiest to print.', 'Декорация, прототипи, подаръци. Най-лесният за принтиране.'],
    watch: ['Softens around 55–60 °C, so not for a hot car. Brittle under repeated bending.', 'Омеква около 55–60 °C, затова не за нагрята кола. Чупливо при често огъване.'],
  },
  {
    name: 'PETG',
    nozzle: '230–250 °C',
    bed: '70–85 °C',
    enclosure: NO,
    good: ['Functional parts, outdoor use, snap fits. Tougher than PLA.', 'Функционални части, употреба навън, щракащи съединения. По-жилав от PLA.'],
    watch: ['Strings easily and absorbs moisture. Can bond too hard to a smooth PEI sheet.', 'Лесно прави нишки и поема влага. Може да залепне твърде силно за гладка PEI плоча.'],
  },
  {
    name: 'ABS',
    nozzle: '230–260 °C',
    bed: '90–110 °C',
    enclosure: YES,
    good: ['Heat-resistant parts. Can be smoothed with acetone.', 'Топлоустойчиви части. Може да се заглажда с ацетон.'],
    watch: ['Warps and splits without an enclosure. Ventilate the room: it gives off fumes.', 'Изкривява се и се цепи без затворена камера. Проветрявай, защото отделя изпарения.'],
  },
  {
    name: 'ASA',
    nozzle: '240–260 °C',
    bed: '90–110 °C',
    enclosure: YES,
    good: ['Outdoor parts: holds up to UV better than ABS.', 'Части за навън: издържа на UV по-добре от ABS.'],
    watch: ['Warps like ABS. Ventilate the room.', 'Изкривява се като ABS. Проветрявай.'],
  },
  {
    name: 'TPU',
    nozzle: '220–240 °C',
    bed: '30–50 °C',
    enclosure: NO,
    good: ['Flexible parts: cases, gaskets, bumpers.', 'Гъвкави части: калъфи, уплътнения, буфери.'],
    watch: ['Print slowly, around 20–30 mm/s. Dry it first. Hard to feed through long Bowden tubes.', 'Принтирай бавно, около 20–30 мм/с. Изсуши го преди това. Трудно минава през дълъг Bowden.'],
  },
  {
    name: 'Nylon (PA)',
    nozzle: '250–290 °C',
    bed: '70–100 °C',
    enclosure: HELPS,
    good: ['Gears, wear parts, tough functional prints.', 'Зъбни колела, износващи се части, здрави функционални принтове.'],
    watch: ['Soaks up moisture within hours, so print from a dryer. A hardened nozzle is needed for carbon-filled grades.', 'Поема влага за часове, затова принтирай от сушилня. Вариантите с въглеродни влакна искат закалена дюза.'],
  },
  {
    name: 'PC',
    nozzle: '260–300 °C',
    bed: '100–120 °C',
    enclosure: YES,
    good: ['Very strong and heat-resistant parts.', 'Много здрави и топлоустойчиви части.'],
    watch: ['Needs a hot enclosure and an all-metal hotend. Warps strongly.', 'Иска топла затворена камера и изцяло метален хотенд. Силно се изкривява.'],
  },
];

export interface Problem {
  title: Pair;
  looks: Pair;
  fixes: Pair[];
}

export const PROBLEMS: Problem[] = [
  {
    title: ['Stringing', 'Нишки между частите'],
    looks: ['Thin hairs between parts of the model.', 'Тънки косъмчета между отделните части на модела.'],
    fixes: [
      ['Dry the filament: wet filament strings far more.', 'Изсуши филамента: влажният прави много повече нишки.'],
      ['Lower the nozzle temperature by 5–10 °C.', 'Намали температурата на дюзата с 5–10 °C.'],
      ['Raise the retraction a little and check the travel speed.', 'Увеличи малко retraction и провери скоростта на празен ход.'],
    ],
  },
  {
    title: ['First layer does not stick', 'Първият слой не залепва'],
    looks: ['The print comes loose or the lines do not bond.', 'Принтът се отлепя или линиите не се свързват.'],
    fixes: [
      ['Wash the plate with dish soap and water. Fingerprints are a common cause.', 'Измий плочата с вода и препарат. Пръстовите отпечатъци са честа причина.'],
      ['Set the Z offset so the first layer is slightly squashed.', 'Настрой Z offset така, че първият слой да е леко притиснат.'],
      ['Raise the bed by 5 °C and slow the first layer down.', 'Вдигни плочата с 5 °C и забави първия слой.'],
    ],
  },
  {
    title: ['Warping', 'Изкривени ъгли'],
    looks: ['Corners lift off the bed as the part cools.', 'Ъглите се вдигат от плочата, докато детайлът изстива.'],
    fixes: [
      ['Add a brim and avoid drafts in the room.', 'Добави brim и избягвай течение в стаята.'],
      ['Use an enclosure for ABS, ASA and PC.', 'Ползвай затворена камера за ABS, ASA и PC.'],
      ['Lower the part cooling fan for the first layers.', 'Намали вентилатора за първите слоеве.'],
    ],
  },
  {
    title: ['Elephant foot', 'Слонски крак'],
    looks: ['The bottom layers bulge outwards.', 'Долните слоеве излизат навън.'],
    fixes: [
      ['Raise the Z offset slightly or lower the bed temperature.', 'Вдигни малко Z offset или намали температурата на плочата.'],
      ['Use the slicer\'s elephant foot compensation.', 'Използвай компенсацията за слонски крак в слайсъра.'],
    ],
  },
  {
    title: ['Under-extrusion', 'Недостатъчно екструдиране'],
    looks: ['Gaps in the walls, thin or missing lines.', 'Дупки в стените, тънки или липсващи линии.'],
    fixes: [
      ['Check for a partial clog and do a cold pull.', 'Провери за частично запушване и направи cold pull.'],
      ['Print slower or hotter: the hotend may not keep up.', 'Принтирай по-бавно или по-горещо: хотендът може да не смогва.'],
      ['Calibrate E-steps and flow in Calculators.', 'Калибрирай E-steps и flow в Калкулатори.'],
    ],
  },
  {
    title: ['Layers split apart', 'Слоевете се разделят'],
    looks: ['The part breaks cleanly along a layer line.', 'Детайлът се чупи чисто по линия на слой.'],
    fixes: [
      ['Raise the nozzle temperature by 5–10 °C.', 'Вдигни температурата на дюзата с 5–10 °C.'],
      ['Reduce part cooling, especially for ABS, ASA and PETG.', 'Намали охлаждането, особено за ABS, ASA и PETG.'],
      ['Orient the part so the load does not pull layers apart.', 'Завърти детайла така, че натоварването да не разделя слоевете.'],
    ],
  },
  {
    title: ['Layer shift', 'Изместени слоеве'],
    looks: ['The whole print jumps sideways at one height.', 'Целият принт се измества настрани на една височина.'],
    fixes: [
      ['Tighten the belts and check the pulleys.', 'Опъни ремъците и провери ролките.'],
      ['Lower the acceleration or speed.', 'Намали ускорението или скоростта.'],
      ['Make sure the nozzle cannot hit curled-up parts.', 'Увери се, че дюзата не удря извити части.'],
    ],
  },
  {
    title: ['Ghosting', 'Вълнички по стените'],
    looks: ['Ripples repeat after sharp corners.', 'Вълнички се повтарят след острите ъгли.'],
    fixes: [
      ['Lower the outer wall speed and acceleration.', 'Намали скоростта и ускорението на външната стена.'],
      ['Run input shaping if your printer supports it.', 'Пусни input shaping, ако принтерът го поддържа.'],
      ['Put the printer on a heavy, stable surface.', 'Сложи принтера на тежка, стабилна повърхност.'],
    ],
  },
  {
    title: ['Sagging overhangs and bridges', 'Провиснали надвеси и мостове'],
    looks: ['Curled edges or drooping lines over gaps.', 'Извити ръбове или провиснали линии над празнини.'],
    fixes: [
      ['Raise part cooling and slow down bridges.', 'Увеличи охлаждането и забави мостовете.'],
      ['Find your limits with Calibration prints, then add supports beyond them.', 'Намери границите си с Калибрационни тестове и добави подпори отвъд тях.'],
    ],
  },
  {
    title: ['Clogged nozzle', 'Запушена дюза'],
    looks: ['Filament does not come out, or the extruder clicks.', 'Филаментът не излиза или екструдерът щрака.'],
    fixes: [
      ['Heat up and do a cold pull with clean filament.', 'Загрей и направи cold pull с чист филамент.'],
      ['Check that the temperature matches the material.', 'Провери дали температурата отговаря на материала.'],
      ['Replace the nozzle if it stays blocked.', 'Смени дюзата, ако остане запушена.'],
    ],
  },
];
