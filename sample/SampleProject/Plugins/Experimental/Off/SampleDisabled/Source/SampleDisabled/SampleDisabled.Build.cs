// SPDX-License-Identifier: AGPL-3.0-or-later

using UnrealBuildTool;

public class SampleDisabled : ModuleRules
{
	public SampleDisabled(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleCore" });
	}
}
