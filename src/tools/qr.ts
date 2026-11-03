// SPDX-License-Identifier: AGPL-3.0-or-later
import { QR_DEFAULTS, qrParts, type QRParams } from '../core/models';
import { t } from '../i18n';
import { check, color, el, hint, range, section, segmented, select, text, type Ctl } from '../ui/form';
import { mountModelTool } from '../ui/modelTool';
import { fontOptions, styleOptions } from '../ui/options';

type State = Omit<QRParams, 'content'> & {
  font: string;
  kind: 'url' | 'text' | 'wifi';
  url: string;
  text: string;
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
};

const wifiEscape = (s: string) => s.replace(/([\\;,":])/g, '\\$1');

export function qrContent(s: Pick<State, 'kind' | 'url' | 'text' | 'ssid' | 'password' | 'security'>): string {
  if (s.kind === 'url') return s.url.trim();
  if (s.kind === 'text') return s.text;
  if (!s.ssid) return '';
  const pass = s.security === 'nopass' ? '' : `P:${wifiEscape(s.password)};`;
  return `WIFI:T:${s.security};S:${wifiEscape(s.ssid)};${pass};`;
}

export function mount(container: HTMLElement): () => void {
  const { content, ...rest } = QR_DEFAULTS;
  return mountModelTool<State>(
    {
      id: 'qr',
      title: t('tool.qr.title'),
      desc: t('tool.qr.desc'),
      defaults: { ...rest, font: 'russo', kind: 'url', url: content, text: '', ssid: '', password: '', security: 'WPA' },
      privateKeys: ['password'],
      build: (m, font, s) => qrParts(m, font, { ...s, content: qrContent(s) }),
      fileName: (s) => `qr_${s.kind === 'wifi' ? s.ssid : 'code'}`,
      controls: (ctl: Ctl<State>) => {
        const s = ctl.state;
        return [
          section(
            t('sec.content'),
            segmented(ctl, 'kind', t('f.qrType'), [
              ['url', t('f.qrType.url')],
              ['text', t('f.qrType.text')],
              ['wifi', t('f.qrType.wifi')],
            ]),
            s.kind === 'url' && text(ctl, 'url', t('f.url'), { type: 'url', placeholder: 'https://' }),
            s.kind === 'text' && text(ctl, 'text', t('f.text'), { multiline: true, rows: 3 }),
            s.kind === 'wifi' && text(ctl, 'ssid', t('f.wifiSsid')),
            s.kind === 'wifi' &&
              select(ctl, 'security', t('f.wifiSecurity'), [
                ['WPA', 'WPA/WPA2/WPA3'],
                ['WEP', 'WEP'],
                ['nopass', '—'],
              ]),
            s.kind === 'wifi' && s.security !== 'nopass' && text(ctl, 'password', t('f.wifiPassword'), { type: 'password' }),
            s.kind === 'wifi' && hint(t('f.wifiHint')),
          ),
          section(
            t('sec.code'),
            select(ctl, 'ecc', t('f.ecc'), [
              ['L', 'L · 7%'],
              ['M', 'M · 15%'],
              ['Q', 'Q · 25%'],
              ['H', 'H · 30%'],
            ]),
            range(ctl, 'module', t('f.module'), { min: 1, max: 6, step: 0.1, unit: t('u.mm') }),
            range(ctl, 'quiet', t('f.quiet'), { min: 1, max: 6, step: 1 }),
            range(ctl, 'corner', t('f.corner'), { min: 0, max: 15, step: 0.5, unit: t('u.mm') }),
            check(ctl, 'hole', t('f.hole')),
            hint(t('f.qrHint')),
          ),
          section(
            t('sec.text'),
            text(ctl, 'label', t('f.label')),
            s.label.trim() !== '' && select(ctl, 'font', t('f.font'), fontOptions(), { fontPreview: true }),
            s.label.trim() !== '' && range(ctl, 'labelHeight', t('f.labelHeight'), { min: 3, max: 20, step: 0.5, unit: t('u.mm') }),
          ),
          section(
            t('sec.thickness'),
            segmented(ctl, 'style', t('f.style'), styleOptions(), t('f.styleHint')),
            range(ctl, 'baseThickness', t('f.base'), { min: 1, max: 6, step: 0.2, unit: t('u.mm') }),
            range(ctl, 'textThickness', t('f.textThickness'), { min: 0.4, max: 4, step: 0.2, unit: t('u.mm') }),
          ),
          section(
            t('sec.colors'),
            el('div', { class: 'swatches' }, color(ctl, 'baseColor', t('f.baseColor')), color(ctl, 'textColor', t('f.textColor'))),
            hint(t('f.colorHint')),
          ),
        ];
      },
    },
    container,
  );
}
