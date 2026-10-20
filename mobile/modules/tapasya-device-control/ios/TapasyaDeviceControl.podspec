Pod::Spec.new do |s|
  s.name           = 'TapasyaDeviceControl'
  s.version        = '0.1.0'
  s.summary        = 'Tapasya Mode focus controls (Screen Time, single-app mode)'
  s.description    = 'Local Expo module for MyCampusView Tapasya Mode.'
  s.license        = 'UNLICENSED'
  s.author         = 'MyCampusView'
  s.homepage       = 'https://mycampusview.com'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'FamilyControls', 'ManagedSettings'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
