import React from 'react';

type DelegationOption = {
  DelegatorID: string;
  DelegatorName?: string;
  DelegateID: string;
};

type DelegationChoiceModalProps = {
  isOpen: boolean;
  userName?: string;
  options: DelegationOption[];
  onChooseSelf: () => void;
  onChooseDelegator: (delegator: DelegationOption) => void;
};

const DelegationChoiceModal: React.FC<DelegationChoiceModalProps> = ({ isOpen, userName, options, onChooseSelf, onChooseDelegator }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true"></div>
      <div className="relative w-full max-w-lg bg-bkg border border-content/10 rounded-lg shadow-xl p-6">
        <h3 className="text-xl font-bold text-content mb-2">اختيار طريقة الدخول</h3>
        <p className="text-sm text-content-secondary mb-4">
          تم التحقق من حسابك{userName ? ` (${userName})` : ''}. لديك تفويضات نشطة؛ اختر إن كنت تريد الدخول بحسابك أو نيابةً عن المفوِّض.
        </p>
        <div className="space-y-3">
          <button
            className="w-full text-right px-4 py-3 rounded-md border border-content/20 bg-content/5 hover:bg-content/10 transition"
            onClick={onChooseSelf}
          >
            <span className="font-semibold">الدخول بحسابي</span>
            <span className="block text-xs text-content-secondary">ستعمل بصفتك نفسك دون تفويض</span>
          </button>
          <div className="border-t border-content/10 pt-3"></div>
          <div className="space-y-2">
            {options.map((opt) => (
              <button
                key={opt.DelegatorID}
                className="w-full text-right px-4 py-3 rounded-md border border-content/20 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition"
                onClick={() => onChooseDelegator(opt)}
              >
                <span className="font-semibold">الدخول نيابةً عن: {opt.DelegatorName || opt.DelegatorID}</span>
                <span className="block text-xs text-orange-700 dark:text-orange-300">سيتم تمرير هوية المفوِّض لجميع الطلبات</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DelegationChoiceModal;