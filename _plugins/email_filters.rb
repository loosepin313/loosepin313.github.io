# Obfuscate email addresses in rendered HTML so naive scrapers can't
# regex them out, while browsers still display and link them normally.
#
# Usage: {{ site.email | email }}
# Output: <a href="&#109;&#97;...">chris&#46;...&#64;gmail&#46;com</a>

module Jekyll
  module EmailFilters
    def email(input)
      addr = input.to_s
      encode = lambda do |str|
        str.chars.map { |c| "&##{c.ord};" }.join
      end
      %(<a href="#{encode.call("mailto:#{addr}")}">#{encode.call(addr)}</a>)
    end
  end
end

Liquid::Template.register_filter(Jekyll::EmailFilters)
