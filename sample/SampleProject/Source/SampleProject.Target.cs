// SPDX-License-Identifier: AGPL-3.0-or-later

using UnrealBuildTool;

public class SampleProjectTarget : TargetRules
{
	public SampleProjectTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SampleProject");
	}
}
