import { formatAmount } from "./money";
import { normalizeLocale, type AppLocale } from "./i18n";

type BotLocaleCopy = {
  locale: AppLocale;
  mainMenu: string[][];
  moreMenu: string[][];
  prompts: { income: string; expense: string; transfer: string };
  startNew: (firstName?: string | null) => string;
  startReturning: (input: { firstName?: string | null; balance: number; monthIncome: number; monthExpense: number }) => string;
  mainMenuText: string;
  moreMenuText: string;
  help: string;
};

function greeting(locale: AppLocale, firstName?: string | null) {
  const name = firstName?.trim();
  if (locale === "ru") return name ? `Здравствуйте, ${name} 👋` : "Здравствуйте 👋";
  if (locale === "uz-Cyrl") return name ? `Ассалому алайкум, ${name} 👋` : "Ассалому алайкум 👋";
  return name ? `Assalomu alaykum, ${name} 👋` : "Assalomu alaykum 👋";
}

export function botLocaleCopy(rawLocale: unknown): BotLocaleCopy {
  const locale = normalizeLocale(rawLocale);

  if (locale === "ru") {
    const mainMenu = [["💰 Доход", "💸 Расход", "🔄 Перевод"]];
    return {
      locale,
      mainMenu,
      moreMenu: [
        ["💳 Счета", "📁 Категории"],
        ["📌 Платежи", "💵 Ожидаемые доходы"],
        ["🎯 Бюджет", "💳 Долги", "🏆 Цели"],
        ["🔔 Уведомления", "⚙️ Настройки"],
        ["⬅️ Главное меню"],
      ],
      prompts: {
        income: "Сколько денег поступило?\n\nНапример: пришла зарплата 1,5 млн",
        expense: "Сколько и на что вы потратили?\n\nНапример: 150 тысяч на продукты",
        transfer: "С какого счёта на какой перевели?\n\nНапример: 200 тысяч с наличных на Humo",
      },
      startNew: (firstName) => [
        greeting(locale, firstName), "",
        "Hisobchi показывает, откуда приходят и куда уходят ваши деньги.", "",
        "💰 Доход — деньги поступили", "💸 Расход — деньги потрачены", "🔄 Перевод — между счетами", "",
        "Добавьте первую операцию 👇",
      ].join("\n"),
      startReturning: (input) => [
        greeting(locale, input.firstName), "",
        `💰 Баланс: ${formatAmount(input.balance)} сум`,
        `📅 Этот месяц: +${formatAmount(input.monthIncome)} / −${formatAmount(input.monthExpense)}`, "",
        "Добавим новую операцию? Нажмите кнопку или напишите сообщение 👇",
      ].join("\n"),
      mainMenuText: "Главное меню. Выберите действие 👇",
      moreMenuText: "📂 Дополнительные разделы. Выберите нужный 👇",
      help: [
        "Как пользоваться Hisobchi 👇", "",
        "Напишите операцию своими словами:",
        "• «150 тысяч на продукты»",
        "• «вчера 150 тысяч продукты, 70 тысяч такси»", "",
        "Команды: /report · /forecast · /kredit · /start", "",
        "Счета, бюджеты, долги, цели и анализ находятся в Mini App.",
      ].join("\n"),
    };
  }

  if (locale === "uz-Cyrl") {
    const mainMenu = [["💰 Даромад", "💸 Харажат", "🔄 Ўтказма"]];
    return {
      locale,
      mainMenu,
      moreMenu: [
        ["💳 Ҳисоблар", "📁 Тоифалар"],
        ["📌 Тўловлар", "💵 Кутилаётган даромад"],
        ["🎯 Бюджет", "💳 Қарздорлик", "🏆 Мақсадлар"],
        ["🔔 Эслатмалар", "⚙️ Созламалар"],
        ["⬅️ Асосий меню"],
      ],
      prompts: {
        income: "Қанча пул келди?\n\nМасалан: 1,5 млн маош келди",
        expense: "Қанча ва нимага сарфладингиз?\n\nМасалан: 150 минг озиқ-овқатга кетди",
        transfer: "Қайси ҳисобдан қайси ҳисобга ўтказдингиз?\n\nМасалан: нақд пулдан Humo’га 200 минг",
      },
      startNew: (firstName) => [
        greeting(locale, firstName), "",
        "Ҳисобчи пулингиз қаердан келиб, қаерга кетаётганини ёзиб боради.", "",
        "💰 Даромад — пул келди", "💸 Харажат — пул кетди", "🔄 Ўтказма — ҳисобдан ҳисобга", "",
        "Биринчи операцияни ҳозир қўшинг 👇",
      ].join("\n"),
      startReturning: (input) => [
        greeting(locale, input.firstName), "",
        `💰 Баланс: ${formatAmount(input.balance)} сўм`,
        `📅 Бу ой: +${formatAmount(input.monthIncome)} / −${formatAmount(input.monthExpense)}`, "",
        "Янги операция қўшамизми? Тугмани босинг ёки ёзиб юборинг 👇",
      ].join("\n"),
      mainMenuText: "Асосий меню. Керакли амални танланг 👇",
      moreMenuText: "📂 Қўшимча бўлимлар. Кераклисини танланг 👇",
      help: [
        "Ҳисобчи шундай ишлайди 👇", "",
        "Операцияни ўз сўзингиз билан ёзинг:",
        "• «150 минг озиқ-овқатга кетди»",
        "• «кеча 150 минг овқат, 70 минг такси»", "",
        "Буйруқлар: /report · /forecast · /kredit · /start", "",
        "Ҳисоблар, бюджет, қарздорлик, мақсадлар ва таҳлил Mini App’да.",
      ].join("\n"),
    };
  }

  return {
    locale,
    mainMenu: [["💰 Daromad", "💸 Xarajat", "🔄 Transfer"]],
    moreMenu: [
      ["💳 Hisoblar", "📁 Kategoriyalar"],
      ["📌 To‘lovlar", "💵 Kutilayotgan daromad"],
      ["🎯 Budjet", "💳 Qarzdorlik", "🏆 Maqsadlar"],
      ["🔔 Eslatmalar", "⚙️ Sozlamalar"],
      ["⬅️ Asosiy menyu"],
    ],
    prompts: {
      income: "Qancha pul keldi?\n\nMasalan: 1,5 mln maosh keldi",
      expense: "Qancha va nimaga sarfladingiz?\n\nMasalan: 150 ming ovqatga ketdi",
      transfer: "Qaysi hisobdan qaysi hisobga o‘tkazdingiz?\n\nMasalan: Naqd puldan Humoga 200 ming",
    },
    startNew: (firstName) => [
      greeting(locale, firstName), "",
      "Hisobchi pulingiz qayerdan kelib, qayerga ketayotganini yozib boradi.", "",
      "💰 Daromad — pul keldi", "💸 Xarajat — pul ketdi", "🔄 Transfer — hisobdan hisobga", "",
      "Birinchi operatsiyani hozir qo‘shing 👇",
    ].join("\n"),
    startReturning: (input) => [
      greeting(locale, input.firstName), "",
      `💰 Balans: ${formatAmount(input.balance)} so‘m`,
      `📅 Bu oy: +${formatAmount(input.monthIncome)} / −${formatAmount(input.monthExpense)}`, "",
      "Yangi operatsiya qo‘shamizmi? Tugmani bosing yoki yozib yuboring 👇",
    ].join("\n"),
    mainMenuText: "Asosiy menyu. Kerakli amalni tanlang 👇",
    moreMenuText: "📂 Qo‘shimcha bo‘limlar. Kerakligini tanlang 👇",
    help: [
      "Hisobchi shunday ishlaydi 👇", "",
      "Operatsiyani o‘z so‘zingiz bilan yozing:",
      "• «150 ming ovqatga ketdi»",
      "• «kecha 150 ming ovqat, 70 ming taksi»", "",
      "Buyruqlar: /report · /forecast · /kredit · /start", "",
      "Hisoblar, budjet, qarzdorlik, maqsadlar va tahlil Mini App’da.",
    ].join("\n"),
  };
}

export function mainMenuForLocale(locale: unknown): string[][] {
  return botLocaleCopy(locale).mainMenu;
}

