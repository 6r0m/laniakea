// SPDX-License-Identifier: AGPL-3.0-or-later
#include "clangd.calls.h"
int Caller(SampleObject& object) {
    auto pointer = &AddressOnly;
    auto second = Called;
    int result = Called();
    result += object.Member();
    result += Receiver(&AddressOnly).Member();
    result += TemplateCall<&AddressOnly>();
    result += TemplateCall<&TemplateCall>();
    (void)sizeof(Called());
    return result;
}
