import { describe, expect, it } from 'vitest';
import { bankAppLink, bankAppsForPlatform, extractIosDeeplink, qrImageUrl, transferNote } from './vietqr';

const bank = { bin: '970422', accountNo: '0123456789', accountName: 'NGUYEN VAN A' };

describe('vietqr', () => {
  it('transferNote bỏ dấu, viết hoa, ≤ 40 ký tự', () => {
    expect(transferNote('2026-10-12', 'Nguyễn Văn Đạt')).toBe('CAU LONG 1210 NGUYEN VAN DAT');
    expect(transferNote('2026-10-12', 'Nguyễn Thị Hoàng Thuỷ Tiên Phương Anh Khoa').length).toBeLessThanOrEqual(40);
  });

  it('bankAppLink có url= và ba theo code viết thường', () => {
    expect(bankAppLink('mb', bank, 58000, 'CAU LONG 1210 NAM', 'https://x.github.io/app/')).toBe(
      'https://dl.vietqr.io/pay?app=mb&ba=0123456789@mb&am=58000&tn=CAU%20LONG%201210%20NAM&bn=NGUYEN%20VAN%20A&url=https%3A%2F%2Fx.github.io%2Fapp%2F',
    );
    expect(bankAppLink('mb', { ...bank, bin: '000000' }, 1, 'x', 'y')).toBeNull();
    // tên chủ TK < 5 ký tự bị dl.vietqr.io từ chối => bỏ bn
    expect(bankAppLink('mb', { ...bank, accountName: 'AN' }, 1000, 'X', 'y')).toBe(
      'https://dl.vietqr.io/pay?app=mb&ba=0123456789@mb&am=1000&tn=X&url=y',
    );
  });

  it('qrImageUrl', () => {
    expect(qrImageUrl(bank, 58000, 'CAU LONG 1210 NAM')).toBe(
      'https://img.vietqr.io/image/970422-0123456789-compact2.png?amount=58000&addInfo=CAU%20LONG%201210%20NAM&accountName=NGUYEN%20VAN%20A',
    );
  });

  it('app autofill xếp trước', () => {
    const apps = bankAppsForPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
    const firstNon = apps.findIndex((a) => !a.autofill);
    expect(apps.slice(0, firstNon).every((a) => a.autofill)).toBe(true);
    expect(apps.slice(firstNon).some((a) => a.autofill)).toBe(false);
  });
});

describe('extractIosDeeplink', () => {
  it('lấy deeplink đã ký từ trang iOS của dl.vietqr.io', () => {
    const html = `<script nonce='x'>
        const DEEPLINK = 'mbbank://applink?targetPage=QRPay&source=Casso&qrContent=000201&callbackurl=https%3A%2F%2Fx.github.io%2F&timestamp=1&signature=a%2Bb%3D';
        const STORE_URL = 'https://apps.apple.com/vn/app/mb-bank/id1205807363';`;
    expect(extractIosDeeplink(html)).toBe(
      'mbbank://applink?targetPage=QRPay&source=Casso&qrContent=000201&callbackurl=https%3A%2F%2Fx.github.io%2F&timestamp=1&signature=a%2Bb%3D',
    );
  });

  it('nhận scheme trần của app không tự điền', () => {
    expect(extractIosDeeplink(`const DEEPLINK = 'vietcombankmobile://';`)).toBe('vietcombankmobile://');
  });

  it.each([
    ['không có DEEPLINK', '{"message":"invalid accountName! mb"}'],
    ['https', `const DEEPLINK = 'https://apps.apple.com/x';`],
    ['javascript', `const DEEPLINK = 'javascript://alert(1)';`],
    ['chuỗi JS có escape', `const DEEPLINK = 'mbbank://a\\'b';`],
  ])('trả null: %s', (_name, html) => {
    expect(extractIosDeeplink(html)).toBeNull();
  });
});
