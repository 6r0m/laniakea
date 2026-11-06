// SPDX-License-Identifier: AGPL-3.0-or-later
int Called();
int AddressOnly();
int TemplateCall();
struct SampleObject { int Member(); };
SampleObject& Receiver(int (*callback)());
template<int (*Callback)()> int TemplateCall() { return Callback(); }
